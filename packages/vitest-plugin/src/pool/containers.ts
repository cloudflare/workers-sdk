import {
	cleanupContainers,
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
	needsCleanup: boolean;
}

interface EnvironmentEntry {
	fingerprint: string;
	project: TestProject;
	dockerPath: string;
	imageTags: Set<string>;
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

function cleanupEntry(entry: EnvironmentEntry): boolean {
	if (!entry.state.needsCleanup) {
		return true;
	}
	if (entry.imageTags.size === 0) {
		entry.state.needsCleanup = false;
		return true;
	}
	if (!cleanupContainers(entry.dockerPath, entry.imageTags)) {
		entry.logger.warn(
			`Failed to clean up local Container instances for Vitest project ${JSON.stringify(entry.project.name)}`
		);
		return false;
	}
	entry.state.needsCleanup = false;
	return true;
}

function dropCurrentEnvironment(project: TestProject): void {
	const entry = currentEnvironmentByProject.get(project);
	currentEnvironmentByProject.delete(project);
	if (entry !== undefined && !entry.state.needsCleanup) {
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
		if (!entry.state.needsCleanup) {
			trackedEnvironments.delete(entry);
		}
	}
}

/** Registers Container preparation cancellation before Vitest starts workers. */
export function registerContainerShutdown(vitest: Vitest): void {
	if (registeredVitestInstances.has(vitest)) {
		return;
	}
	registeredVitestInstances.add(vitest);
	vitest.onClose(() => beginVitestShutdown(vitest));
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
 * @param logger - Logger used by image preparation and cleanup.
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
		existing.state.needsCleanup = true;
		return existing.preparation;
	}

	const state: PreparationState = {
		cancelled: false,
		needsCleanup: true,
	};
	const environment: ProjectContainerEnvironment = {
		containerBuildId,
		containerEngine,
	};
	const imageTags = new Set(
		plan.containerOptions.map(({ image_tag }) => image_tag)
	);
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
		dockerPath,
		imageTags,
		logger,
		state,
		preparation,
	};
	const replaced = currentEnvironmentByProject.get(project);
	currentEnvironmentByProject.set(project, entry);
	trackedEnvironments.add(entry);
	if (replaced !== undefined && !replaced.state.needsCleanup) {
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

/** Removes Container instances after every pool worker has stopped. */
export function cleanupContainerInstances(): void {
	for (const entry of trackedEnvironments) {
		if (
			cleanupEntry(entry) &&
			(entry.state.cancelled ||
				currentEnvironmentByProject.get(entry.project) !== entry)
		) {
			trackedEnvironments.delete(entry);
		}
	}
}

/** Performs the synchronous portion of Container cleanup during process exit. */
export function disposeContainersOnProcessExit(): void {
	for (const entry of trackedEnvironments) {
		cancelEntry(entry);
		cleanupEntry(entry);
	}
	currentEnvironmentByProject.clear();
	trackedEnvironments.clear();
}

process.once("exit", disposeContainersOnProcessExit);
