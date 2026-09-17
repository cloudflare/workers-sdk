import path from "node:path";
import {
	createContainerDevPlan,
	generateContainerBuildId,
	isCloudflareRegistryImage,
	prepareContainerImagesForDev,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { UserError } from "@cloudflare/workers-utils/errors";
import type {
	ContainerDevOptions,
	ViteLogger,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";
import type { V4MiniflareOptions } from "miniflare";
import type { TestProject, Vitest } from "vitest/node";

interface ProjectContainerEnvironment {
	containerBuildId: string;
	containerEngine: NonNullable<V4MiniflareOptions["containerEngine"]>;
}

interface PreparationState {
	abort?: () => void;
	cancelled: boolean;
}

interface EnvironmentEntry {
	fingerprint: string;
	logger: ViteLogger;
	state: PreparationState;
	preparation: Promise<ProjectContainerEnvironment>;
}

/** Container state owned by one Vitest instance. */
interface VitestContainers {
	closing: boolean;
	environments: Map<TestProject, EnvironmentEntry>;
}

const containersByVitest = new WeakMap<Vitest, VitestContainers>();
// Instances whose image preparation must be cancelled if the process exits.
const activeContainers = new Set<VitestContainers>();

function getEnvironmentFingerprint(
	config: Config,
	configPath: string,
	dockerPath: string,
	containerEngine: NonNullable<V4MiniflareOptions["containerEngine"]>
): string {
	return JSON.stringify([
		configPath,
		dockerPath,
		containerEngine,
		config.compliance_region,
		config.containers,
		config.exports,
	]);
}

function abortPreparation(
	abort: (() => void) | undefined,
	logger: ViteLogger
): void {
	try {
		abort?.();
	} catch (error) {
		logger.warn(
			`Container image preparation cancellation failed: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function cancelEntry(entry: EnvironmentEntry): void {
	entry.state.cancelled = true;
	const abort = entry.state.abort;
	entry.state.abort = undefined;
	abortPreparation(abort, entry.logger);
}

function cancelEnvironments(containers: VitestContainers): void {
	for (const entry of containers.environments.values()) {
		cancelEntry(entry);
	}
	containers.environments.clear();
}

function closeContainers(containers: VitestContainers): void {
	containers.closing = true;
	cancelEnvironments(containers);
	activeContainers.delete(containers);
	if (activeContainers.size === 0) {
		process.off("exit", cancelContainerPreparationOnProcessExit);
	}
}

function getContainers(vitest: Vitest): VitestContainers {
	let containers = containersByVitest.get(vitest);
	if (containers === undefined) {
		const created: VitestContainers = {
			closing: false,
			environments: new Map(),
		};
		// Vitest keeps close handlers across configuration restarts, so register
		// once per instance.
		vitest.onClose(() => closeContainers(created));
		containersByVitest.set(vitest, created);
		containers = created;
	}
	return containers;
}

function setEnvironment(
	containers: VitestContainers,
	project: TestProject,
	entry: EnvironmentEntry
): void {
	dropEnvironment(project);
	containers.environments.set(project, entry);
	if (activeContainers.size === 0) {
		process.on("exit", cancelContainerPreparationOnProcessExit);
	}
	activeContainers.add(containers);
}

function dropEnvironment(project: TestProject): void {
	const environments = containersByVitest.get(project.vitest)?.environments;
	const entry = environments?.get(project);
	if (environments !== undefined && entry !== undefined) {
		environments.delete(project);
		cancelEntry(entry);
	}
}

/**
 * Starts Container lifecycle for a newly configured Vitest server.
 * Vitest reuses the same instance after configuration restarts, so this
 * clears shutdown state from the previous configuration generation.
 */
export function beginContainerConfiguration(vitest: Vitest): void {
	getContainers(vitest).closing = false;
}

function getPreparationError(project: TestProject, error: unknown): UserError {
	const detail = error instanceof Error ? error.message : String(error);
	return new UserError(
		`Unable to prepare Containers for Vitest project ${JSON.stringify(project.name)}.\n\n${detail}`,
		{ cause: error, telemetryMessage: false }
	);
}

async function prepareImages(
	config: Config,
	configPath: string,
	dockerPath: string,
	containerOptions: ContainerDevOptions[],
	state: PreparationState,
	logger: ViteLogger
): Promise<void> {
	if (
		containerOptions.some(
			(option) =>
				"image_uri" in option &&
				isCloudflareRegistryImage(option.image_uri, config)
		)
	) {
		throw new UserError(
			"Cloudflare-managed registry images are not yet supported by the Vitest plugin. " +
				"Use a Dockerfile, including one whose FROM instruction references the image, or an external registry image.",
			{ telemetryMessage: false }
		);
	}

	const result = await prepareContainerImagesForDev({
		dockerPath,
		containerOptions,
		onContainerImagePreparationStart: ({ abort }) => {
			if (state.cancelled) {
				abortPreparation(abort, logger);
				return;
			}
			state.abort = abort;
		},
		onContainerImagePreparationEnd: () => {
			state.abort = undefined;
		},
		logger,
		complianceConfig: config,
		configFileName: path.basename(configPath),
		registryConfigureCommand: "wrangler containers registries configure",
	});

	if (state.cancelled || result.aborted) {
		throw new Error("Container image preparation was aborted");
	}
}

/**
 * Prepares the local Container environment shared by one Vitest project.
 * Successful preparation remains cached until Vitest closes.
 *
 * @param project - Vitest project that owns the prepared environment.
 * @param config - Normalized Worker configuration.
 * @param configPath - Absolute path to the selected Worker configuration.
 * @param logger - Logger used by image preparation and cancellation.
 * @returns Runtime Container options, or `undefined` when Containers are inactive.
 */
export async function prepareProjectContainers(
	project: TestProject,
	config: Config,
	configPath: string,
	logger: ViteLogger
): Promise<ProjectContainerEnvironment | undefined> {
	if (!config.dev.enable_containers || !config.containers?.length) {
		dropEnvironment(project);
		return undefined;
	}

	const containers = getContainers(project.vitest);
	if (containers.closing) {
		throw getPreparationError(
			project,
			new Error("Container image preparation was aborted")
		);
	}

	const containerBuildId = generateContainerBuildId();
	let plan: ReturnType<typeof createContainerDevPlan>;
	try {
		plan = createContainerDevPlan({
			containers: config.containers,
			exports: config.exports,
			containerBuildId,
			configPath,
		});
	} catch (error) {
		throw getPreparationError(project, error);
	}
	if (plan === undefined) {
		dropEnvironment(project);
		return undefined;
	}

	const dockerPath = getDockerPath();
	const containerEngine =
		config.dev.container_engine ?? resolveDockerHost(dockerPath);
	const fingerprint = getEnvironmentFingerprint(
		config,
		configPath,
		dockerPath,
		containerEngine
	);
	const existing = containers.environments.get(project);
	if (existing?.fingerprint === fingerprint) {
		return existing.preparation;
	}

	const state: PreparationState = {
		cancelled: false,
	};
	const environment: ProjectContainerEnvironment = {
		containerBuildId,
		containerEngine,
	};
	const preparation = prepareImages(
		config,
		configPath,
		dockerPath,
		plan.containerOptions,
		state,
		logger
	)
		.then(() => environment)
		.catch((error: unknown) => {
			throw getPreparationError(project, error);
		});
	const entry: EnvironmentEntry = {
		fingerprint,
		logger,
		state,
		preparation,
	};
	setEnvironment(containers, project, entry);

	try {
		return await preparation;
	} catch (error) {
		if (containers.environments.get(project) === entry) {
			dropEnvironment(project);
		}
		throw error;
	}
}

/** Cancels in-progress Container image preparation during process exit. */
export function cancelContainerPreparationOnProcessExit(): void {
	for (const containers of activeContainers) {
		cancelEnvironments(containers);
	}
}
