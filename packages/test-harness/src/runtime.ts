import * as fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import {
	createContainerPreviewPlanForCfConfig,
	createMiniflareExports,
	prepareContainerImagesForCfConfig,
} from "@cloudflare/containers-shared";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { getWorkerZone } from "@cloudflare/workers-utils";
import { toApiComplianceRegion } from "@cloudflare/workers-utils/compliance";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { resolveLocalBindings } from "miniflare";
import { getRemoteBindingsAuth } from "./auth";
import type {
	InlineWorkerConfig,
	TestHarnessOptions,
	WorkerInput,
} from "./types";
import type {
	BuildOutput,
	BuildOutputWorker,
} from "@cloudflare/build-output-utils";
import type { ContainerDevRuntimeOptions } from "@cloudflare/containers-shared";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { WorkerOptions } from "miniflare";

type Manifest = NonNullable<WorkerOptions["config"]["manifest"]>;
type BuildOutputInput = Exclude<WorkerInput, { config: InlineWorkerConfig }>;

/** A Worker read from Build Output or inline config */
type WorkerSource = {
	/** The directory containing the Worker's `.dev.vars`, `.env` and migrations */
	projectDir: string;
	rootConfig: Pick<
		BuildOutput["rootConfig"],
		"accountId" | "complianceRegion"
	> & {
		buildContext: { mode?: string };
	};
	worker: Pick<BuildOutputWorker, "bundleDir" | "assetsDir"> & {
		config: Omit<BuildOutputWorker["config"], "manifest">;
	};
	manifest: Manifest;
	/** The Containers in the Worker's Build Output */
	containers: BuildOutput["containers"];
};

const remoteBindingsLogger: RemoteBindingsLogger = {
	loggerLevel: "log",
	// Look up console methods when called, so console spies see them
	debug: (...args) => console.debug(...args),
	log: (...args) => console.log(...args),
	info: (...args) => console.info(...args),
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
	console(method, ...args) {
		Reflect.apply(console[method], console, args);
	},
};

/** A Worker from a project's Build Output, resolved for Miniflare */
export type ResolvedWorker = {
	/** The project directory containing the Worker's Build Output */
	projectDir: string;
	/** The Worker's Miniflare options */
	options: WorkerOptions;
	/** The Worker's remote bindings session, if it has remote bindings */
	remoteProxySessionData: RemoteProxySessionData | null;
};

/**
 * Resolves Workers from their projects' Build Output, as `vite preview` runs
 * a build.
 *
 * @param options The Workers to run, primary Worker first, and the directory
 * that relative `project` paths resolve from
 * @param previousWorkers The Workers these replace, whose remote sessions
 * are updated rather than started again
 * @returns The resolved Workers
 */
export async function resolveWorkerInputs(
	{ root = process.cwd(), workers: inputs }: TestHarnessOptions,
	previousWorkers: ResolvedWorker[] = []
): Promise<ResolvedWorker[]> {
	if (inputs.length === 0) {
		throw new Error("Test harness requires at least one worker.");
	}

	const workers: ResolvedWorker[] = [];
	try {
		// One at a time, so a failure leaves no remote session still starting
		for (const [index, input] of inputs.entries()) {
			workers.push(
				await resolveWorker(
					root,
					input,
					previousWorkers[index]?.remoteProxySessionData ?? null
				)
			);
		}
		return workers;
	} catch (error) {
		await disposeRemoteProxySessions(workers);
		throw error;
	}
}

/**
 * Disposes the remote bindings sessions of resolved Workers.
 *
 * @param workers The resolved Workers
 */
export async function disposeRemoteProxySessions(
	workers: ResolvedWorker[]
): Promise<void> {
	await Promise.all(
		workers.map(({ remoteProxySessionData }) =>
			remoteProxySessionData?.session.dispose()
		)
	);
}

/**
 * Resolves one Worker in a project's Build Output for Miniflare.
 *
 * @param root The directory that a relative `project` path resolves from
 * @param input The Worker to run, and its test values
 * @param preExistingRemoteProxySessionData The remote session of the Worker
 * this replaces, if any
 * @returns The Worker's Miniflare options and remote bindings session
 */
async function resolveWorker(
	root: string,
	input: WorkerInput,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null
): Promise<ResolvedWorker> {
	const { projectDir, rootConfig, worker, manifest, containers } =
		"config" in input
			? getInlineWorker(root, input.config)
			: await readWorker(root, input);
	const testBindings = "config" in input ? undefined : input.envOverrides;

	// Secrets come from the files for the build's mode, as in `vite preview`
	const mode = rootConfig.buildContext.mode ?? "production";
	const [localEnv, devVars] = await Promise.all([
		loadEnv(projectDir, mode),
		loadDevVars(projectDir, mode),
	]);
	const {
		assets,
		env: configuredEnv,
		exports: _exports,
		...config
	} = worker.config;
	// Test bindings replace configured ones before anything uses them, so an
	// overridden remote binding doesn't start a remote session
	const testEnv: NonNullable<typeof configuredEnv> = {};
	for (const [name, binding] of Object.entries({
		...configuredEnv,
		...testBindings,
	})) {
		// As in `cloudflare.config.ts`, these omit the binding
		if (binding !== false && binding !== null && binding !== undefined) {
			testEnv[name] = binding;
		}
	}
	const env = resolveLocalBindings(testEnv, {
		workerName: config.name,
		localEnv: localEnv.values,
		devVars,
		mode,
		logger: console,
	});
	// Before starting a remote session, so a failure here can't leave it running
	const exports = createMiniflareExports({
		exports: worker.config.exports,
		containerRuntimeOptions: await prepareContainers(
			containers,
			worker.config.exports,
			rootConfig
		),
	});

	const session = await maybeStartOrUpdateRemoteProxySession(
		{
			name: config.name,
			target: "cf",
			env: testEnv,
			complianceRegion: toApiComplianceRegion(rootConfig.complianceRegion),
		},
		preExistingRemoteProxySessionData,
		getRemoteBindingsAuth(
			projectDir,
			rootConfig.accountId,
			remoteBindingsLogger
		),
		{ cliDisplayName: "cf", logger: remoteBindingsLogger }
	);

	return {
		projectDir,
		options: {
			config: {
				...config,
				env,
				exports,
				manifest,
				assets: worker.assetsDir
					? {
							...assets,
							directory: worker.assetsDir,
							hasUserWorker: worker.bundleDir !== undefined,
						}
					: undefined,
			},
			dev: {
				zone: getWorkerZone(worker.config),
				remoteProxyConnectionString:
					session?.session.remoteProxyConnectionString,
			},
		},
		remoteProxySessionData: session,
	};
}

/**
 * Reads a Worker from a project's Build Output.
 *
 * @param root The directory that a relative `project` path resolves from
 * @param input The Worker to read
 * @returns The Worker and where it came from
 */
async function readWorker(
	root: string,
	input: BuildOutputInput
): Promise<WorkerSource> {
	const projectDir = path.resolve(root, toPath(input.project));
	const buildOutput = await readBuildOutput(projectDir);
	const builtWorkers = Object.values(buildOutput.workers);
	const worker =
		input.name === undefined
			? buildOutput.workers.default
			: builtWorkers.find(({ config }) => config.name === input.name);
	if (worker === undefined) {
		throw new Error(
			`No Worker named "${input.name}" in the Build Output at ${projectDir}. It has: ${builtWorkers.map(({ config }) => config.name).join(", ")}.`
		);
	}

	return {
		projectDir,
		rootConfig: buildOutput.rootConfig,
		worker,
		manifest: await getManifest(worker),
		containers: buildOutput.containers,
	};
}

/**
 * @param root The harness's `root`
 * @param config The inline Worker config
 * @returns The inline Worker
 */
function getInlineWorker(
	root: string,
	config: InlineWorkerConfig
): WorkerSource {
	return {
		projectDir: root,
		rootConfig: { buildContext: {} },
		worker: { config, bundleDir: undefined, assetsDir: undefined },
		manifest: config.manifest,
		containers: [],
	};
}

/**
 * Reads a Worker's modules from its Build Output bundle.
 *
 * @param worker The Worker in the Build Output
 * @returns The Worker's module manifest
 */
async function getManifest(worker: BuildOutputWorker): Promise<Manifest> {
	const { manifest } = worker.config;
	if (manifest === undefined || worker.bundleDir === undefined) {
		// An assets-only Worker has no code of its own
		return {
			mainModule: "index.mjs",
			modules: {
				"index.mjs": { type: "esm", contents: "export default {};" },
			},
		};
	}

	const { bundleDir } = worker;
	const modules: Manifest["modules"] = {};
	await Promise.all(
		Object.entries(manifest.modules).map(async ([modulePath, { type }]) => {
			const contents = await fsp.readFile(path.join(bundleDir, modulePath));
			modules[modulePath] = {
				type,
				contents:
					type === "wasm" || type === "data"
						? new Uint8Array(contents)
						: contents.toString(),
			};
		})
	);
	return { mainModule: manifest.mainModule, modulesRoot: bundleDir, modules };
}

/**
 * Plans a Worker's Containers as `vite preview` does, and pulls the images
 * the build didn't build locally.
 *
 * @param containers The Containers in the Worker's Build Output
 * @param exports The Worker's exports
 * @param settings The build's account and compliance region
 * @returns The local runtime options of each Container-backed export
 */
async function prepareContainers(
	containers: WorkerSource["containers"],
	exports: WorkerSource["worker"]["config"]["exports"],
	settings: WorkerSource["rootConfig"]
): Promise<Map<string, ContainerDevRuntimeOptions> | undefined> {
	const plan = createContainerPreviewPlanForCfConfig({
		containers: containers.map(({ config }) => config),
		exports,
	});
	if (plan === undefined) {
		return undefined;
	}

	const preparation = {
		dockerPath: getDockerPath(),
		containerOptions: plan.containerOptions,
		settings,
	};
	// Skip an unchanged preparation, so listen(), reset() and update() don't
	// pull the same images again
	const preparationKey = JSON.stringify(preparation);
	if (!preparedContainerImages.has(preparationKey)) {
		await prepareContainerImagesForCfConfig({
			...preparation,
			logger: remoteBindingsLogger,
			operation: "running tests",
		});
		preparedContainerImages.add(preparationKey);
	}
	return plan.containerRuntimeOptions;
}

/** The container image preparations done in this process */
const preparedContainerImages = new Set<string>();

/**
 * @param value A path, or a `file:` URL
 * @returns The path
 */
function toPath(value: string | URL): string {
	return value instanceof URL ? fileURLToPath(value) : value;
}
