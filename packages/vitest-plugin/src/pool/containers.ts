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
	project: TestProject;
	logger: ViteLogger;
	state: PreparationState;
	preparation: Promise<ProjectContainerEnvironment>;
}

interface ProjectContainerInputs {
	dockerfiles: Set<string>;
	buildContexts: Set<string>;
}

interface VitestContainerWatch {
	watcher: Vitest["vite"]["watcher"];
	projects: Map<TestProject, ProjectContainerInputs>;
	onInputChange: (filePath: string) => void;
}

const currentEnvironmentByProject = new Map<TestProject, EnvironmentEntry>();
const trackedEnvironments = new Set<EnvironmentEntry>();
const containerWatchByVitest = new Map<Vitest, VitestContainerWatch>();
const registeredVitestInstances = new WeakSet<Vitest>();
const closingVitestInstances = new WeakSet<Vitest>();
const CONTAINER_INPUT_EVENTS = [
	"change",
	"add",
	"unlink",
	"addDir",
	"unlinkDir",
] as const;

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

function invalidateCurrentEnvironment(project: TestProject): void {
	const entry = currentEnvironmentByProject.get(project);
	if (entry === undefined) {
		return;
	}
	currentEnvironmentByProject.delete(project);
	cancelEntry(entry);
	trackedEnvironments.delete(entry);
}

function matchesContainerInput(
	inputs: ProjectContainerInputs,
	filePath: string
): boolean {
	if (inputs.dockerfiles.has(filePath)) {
		return true;
	}
	for (const buildContext of inputs.buildContexts) {
		const relativePath = path.relative(buildContext, filePath);
		const isOutsideBuildContext =
			relativePath === ".." ||
			relativePath.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relativePath);
		if (!isOutsideBuildContext) {
			return true;
		}
	}
	return false;
}

function rerunTestsForContainerInput(vitest: Vitest, filePath: string): void {
	const triggerPath = filePath.replaceAll(path.sep, "/");
	const forceRerunTriggers = vitest.config.forceRerunTriggers;
	const addedTrigger = !forceRerunTriggers.includes(triggerPath);
	// Vitest's unlink listener records paths before this listener runs, while
	// onFileChange() ignores paths already marked for invalidation. Preserve that
	// invalidation around the forced change notification.
	const wasInvalidated = vitest.watcher.invalidates.delete(triggerPath);
	if (addedTrigger) {
		forceRerunTriggers.push(triggerPath);
	}
	try {
		// Container inputs may not be Vite modules. Classify this event as a force
		// trigger while Vitest schedules its normal debounced watch rerun.
		vitest.watcher.onFileChange(triggerPath);
	} finally {
		if (wasInvalidated) {
			vitest.watcher.invalidates.add(triggerPath);
		}
		if (addedTrigger) {
			forceRerunTriggers.splice(forceRerunTriggers.lastIndexOf(triggerPath), 1);
		}
	}
}

function onContainerInputChange(
	vitest: Vitest,
	projects: Map<TestProject, ProjectContainerInputs>,
	changedPath: string
): void {
	const filePath = path.resolve(changedPath);
	let matched = false;
	for (const [project, inputs] of projects) {
		if (matchesContainerInput(inputs, filePath)) {
			matched = true;
			invalidateCurrentEnvironment(project);
		}
	}
	if (matched) {
		rerunTestsForContainerInput(vitest, filePath);
	}
}

function clearVitestContainerWatches(vitest: Vitest): void {
	const state = containerWatchByVitest.get(vitest);
	if (state === undefined) {
		return;
	}
	for (const event of CONTAINER_INPUT_EVENTS) {
		state.watcher.off(event, state.onInputChange);
	}
	containerWatchByVitest.delete(vitest);
}

function clearProjectContainerWatch(project: TestProject): void {
	const state = containerWatchByVitest.get(project.vitest);
	state?.projects.delete(project);
	if (state?.projects.size === 0) {
		clearVitestContainerWatches(project.vitest);
	}
}

function watchProjectContainerInputs(
	project: TestProject,
	containerOptions: ContainerDevOptions[]
): void {
	const dockerfiles = new Set<string>();
	const buildContexts = new Set<string>();
	for (const option of containerOptions) {
		if ("dockerfile" in option) {
			dockerfiles.add(path.resolve(option.dockerfile));
			buildContexts.add(path.resolve(option.image_build_context));
		}
	}
	if (dockerfiles.size === 0) {
		clearProjectContainerWatch(project);
		return;
	}

	const vitest = project.vitest;
	const watcher = vitest.vite.watcher;
	let state = containerWatchByVitest.get(vitest);
	if (state?.watcher !== watcher) {
		clearVitestContainerWatches(vitest);
		const projects = new Map<TestProject, ProjectContainerInputs>();
		const onInputChange = (filePath: string) =>
			onContainerInputChange(vitest, projects, filePath);
		state = { watcher, projects, onInputChange };
		containerWatchByVitest.set(vitest, state);
		for (const event of CONTAINER_INPUT_EVENTS) {
			watcher.on(event, onInputChange);
		}
	}

	state.projects.set(project, { dockerfiles, buildContexts });
	watcher.add([...dockerfiles, ...buildContexts]);
}

function dropCurrentEnvironment(project: TestProject): void {
	clearProjectContainerWatch(project);
	const entry = currentEnvironmentByProject.get(project);
	currentEnvironmentByProject.delete(project);
	if (entry !== undefined) {
		cancelEntry(entry);
		trackedEnvironments.delete(entry);
	}
}

function beginVitestShutdown(vitest: Vitest): void {
	closingVitestInstances.add(vitest);
	clearVitestContainerWatches(vitest);
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
	watchProjectContainerInputs(project, plan.containerOptions);
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
	for (const vitest of containerWatchByVitest.keys()) {
		clearVitestContainerWatches(vitest);
	}
	for (const entry of trackedEnvironments) {
		cancelEntry(entry);
	}
	currentEnvironmentByProject.clear();
	trackedEnvironments.clear();
}

process.once("exit", cancelContainerPreparationOnProcessExit);
