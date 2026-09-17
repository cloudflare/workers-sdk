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
	project: TestProject;
	logger: ViteLogger;
	state: PreparationState;
	preparation: Promise<ProjectContainerEnvironment>;
}

const currentEnvironmentByProject = new Map<TestProject, EnvironmentEntry>();
const trackedEnvironments = new Set<EnvironmentEntry>();
const registeredVitestInstances = new WeakSet<Vitest>();
const closingVitestInstances = new WeakSet<Vitest>();

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

function dropCurrentEnvironment(project: TestProject): void {
	const entry = currentEnvironmentByProject.get(project);
	currentEnvironmentByProject.delete(project);
	if (entry !== undefined) {
		cancelEntry(entry);
		trackedEnvironments.delete(entry);
	}
}

function beginVitestShutdown(vitest: Vitest): void {
	closingVitestInstances.add(vitest);
	for (const entry of trackedEnvironments) {
		if (entry.project.vitest !== vitest) {
			continue;
		}
		if (currentEnvironmentByProject.get(entry.project) === entry) {
			currentEnvironmentByProject.delete(entry.project);
		}
		cancelEntry(entry);
		trackedEnvironments.delete(entry);
	}
}

// Installs the close handler once per Vitest instance.
function registerContainerShutdown(vitest: Vitest): void {
	if (registeredVitestInstances.has(vitest)) {
		return;
	}
	registeredVitestInstances.add(vitest);
	vitest.onClose(() => beginVitestShutdown(vitest));
}

/**
 * Starts Container lifecycle for a newly configured Vitest server.
 * Vitest reuses the same instance after configuration restarts, so this
 * clears shutdown state from the previous configuration generation.
 */
export function beginContainerConfiguration(vitest: Vitest): void {
	closingVitestInstances.delete(vitest);
	registerContainerShutdown(vitest);
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
		dropCurrentEnvironment(project);
		return undefined;
	}

	registerContainerShutdown(project.vitest);
	if (closingVitestInstances.has(project.vitest)) {
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
		dropCurrentEnvironment(project);
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
	const existing = currentEnvironmentByProject.get(project);
	if (
		existing !== undefined &&
		!existing.state.cancelled &&
		existing.fingerprint === fingerprint
	) {
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
		project,
		logger,
		state,
		preparation,
	};
	const replaced = currentEnvironmentByProject.get(project);
	currentEnvironmentByProject.set(project, entry);
	trackedEnvironments.add(entry);
	if (replaced !== undefined) {
		cancelEntry(replaced);
		trackedEnvironments.delete(replaced);
	}

	try {
		return await preparation;
	} catch (error) {
		if (currentEnvironmentByProject.get(project) === entry) {
			currentEnvironmentByProject.delete(project);
		}
		cancelEntry(entry);
		trackedEnvironments.delete(entry);
		throw error;
	}
}

/** Cancels in-progress Container image preparation during process exit. */
export function cancelContainerPreparationOnProcessExit(): void {
	for (const entry of trackedEnvironments) {
		cancelEntry(entry);
	}
	currentEnvironmentByProject.clear();
	trackedEnvironments.clear();
}

process.once("exit", cancelContainerPreparationOnProcessExit);
