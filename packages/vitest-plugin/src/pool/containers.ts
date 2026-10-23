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

interface ContainerInputs {
	dockerfiles: Set<string>;
	buildContexts: Set<string>;
}

type WatchTriggerPattern = NonNullable<
	Vitest["config"]["watchTriggerPatterns"]
>[number];

/** Container state owned by one Vitest instance. */
interface VitestContainers {
	closing: boolean;
	environments: Map<TestProject, EnvironmentEntry>;
	/** Local Docker inputs of each project with Dockerfile-built images. */
	inputs: Map<TestProject, ContainerInputs>;
	/** Vite watcher that `onInputChange` is subscribed to. */
	watcher?: Vitest["vite"]["watcher"];
	onInputChange: (filePath: string) => void;
	rerunTrigger: WatchTriggerPattern;
}

const containersByVitest = new WeakMap<Vitest, VitestContainers>();
// Instances whose image preparation must be cancelled if the process exits.
const activeContainers = new Set<VitestContainers>();
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

function cancelEnvironments(containers: VitestContainers): void {
	for (const entry of containers.environments.values()) {
		cancelEntry(entry);
	}
	containers.environments.clear();
}

function isContainerInput(inputs: ContainerInputs, filePath: string): boolean {
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

function getProjectsUsingInput(
	containers: VitestContainers,
	changedPath: string
): TestProject[] {
	const filePath = path.resolve(changedPath);
	return [...containers.inputs]
		.filter(([, inputs]) => isContainerInput(inputs, filePath))
		.map(([project]) => project);
}

function stopWatching(containers: VitestContainers): void {
	for (const event of CONTAINER_INPUT_EVENTS) {
		containers.watcher?.off(event, containers.onInputChange);
	}
	containers.watcher = undefined;
}

function unwatchProject(project: TestProject): void {
	const containers = containersByVitest.get(project.vitest);
	if (containers?.inputs.delete(project) && containers.inputs.size === 0) {
		stopWatching(containers);
	}
}

function watchProjectInputs(
	containers: VitestContainers,
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
		unwatchProject(project);
		return;
	}

	const vitest = project.vitest;
	const watcher = vitest.vite.watcher;
	if (containers.watcher !== watcher) {
		stopWatching(containers);
		for (const event of CONTAINER_INPUT_EVENTS) {
			watcher.on(event, containers.onInputChange);
		}
		containers.watcher = watcher;
	}
	// Vitest resolves a new config on restart, which drops the trigger.
	vitest.config.watchTriggerPatterns ??= [];
	if (!vitest.config.watchTriggerPatterns.includes(containers.rerunTrigger)) {
		vitest.config.watchTriggerPatterns.push(containers.rerunTrigger);
	}
	containers.inputs.set(project, { dockerfiles, buildContexts });
	watcher.add([...dockerfiles, ...buildContexts]);
}

function closeContainers(containers: VitestContainers): void {
	containers.closing = true;
	stopWatching(containers);
	containers.inputs.clear();
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
			inputs: new Map(),
			// Every input event invalidates cached images. Vitest reruns only for
			// changed and added files (see rerunTrigger), so a deleted input takes
			// effect on the next run, as with deleted modules.
			onInputChange(filePath) {
				for (const project of getProjectsUsingInput(created, filePath)) {
					dropEnvironment(project);
				}
			},
			rerunTrigger: {
				// Inputs change as projects are prepared, so match every path here
				// and select Container inputs in testsToRun().
				pattern: /^/,
				testsToRun(filePath) {
					// Like forceRerunTriggers, rerun every test: Container images
					// are shared runtime state rather than imported modules.
					return getProjectsUsingInput(created, filePath).length > 0
						? vitest.state.getFilepaths()
						: undefined;
				},
			},
		};
		// Vitest keeps close handlers across configuration restarts, so register
		// once per instance.
		vitest.onClose(() => closeContainers(created));
		containersByVitest.set(vitest, created);
		containers = created;
	}
	return containers;
}

function dropEnvironment(project: TestProject): void {
	const environments = containersByVitest.get(project.vitest)?.environments;
	const entry = environments?.get(project);
	if (environments !== undefined && entry !== undefined) {
		environments.delete(project);
		cancelEntry(entry);
	}
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
		unwatchProject(project);
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
		unwatchProject(project);
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
	watchProjectInputs(containers, project, plan.containerOptions);

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
