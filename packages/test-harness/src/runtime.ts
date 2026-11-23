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
import type { TestHarnessOptions, WorkerInput } from "./test-harness";
import type {
	BuildOutput,
	BuildOutputWorker,
} from "@cloudflare/build-output-utils";
import type { ContainerDevRuntimeOptions } from "@cloudflare/containers-shared";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { CloudflareAuth } from "@cloudflare/workers-auth/cf";
import type { WorkerOptions } from "miniflare";

/** What a test harness keeps for as long as it exists */
export type HarnessContext = {
	/** Logs to the console, for remote bindings and Container image pulls */
	logger: RemoteBindingsLogger;
	/** Each cf auth profile's auth, which the harness's Workers share */
	authByProfile: Map<string, CloudflareAuth>;
	/**
	 * The Container image preparations done, so `reset()` and `update()` don't
	 * pull the same images again
	 */
	preparedContainerImages: Set<string>;
};

/**
 * @returns The context of a new test harness
 */
export function createHarnessContext(): HarnessContext {
	return {
		logger: {
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
		},
		authByProfile: new Map(),
		preparedContainerImages: new Set(),
	};
}

/** A Worker from a project's Build Output, resolved for Miniflare */
export type ResolvedWorker = {
	/**
	 * The project directory containing the Worker's Build Output, or the
	 * harness's `root` for an inline Worker
	 */
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
 * @param ctx The harness's state
 * @param options The Workers to run, primary Worker first, and the directory
 * that relative `projectDir` paths resolve from
 * @param previousWorkers The Workers these replace. A Worker updates the
 * remote session of the previous Worker with its name rather than starting
 * another.
 * @returns The resolved Workers
 */
export async function resolveWorkerInputs(
	ctx: HarnessContext,
	{ root = process.cwd(), workers: inputs }: TestHarnessOptions,
	previousWorkers: ResolvedWorker[] = []
): Promise<ResolvedWorker[]> {
	if (inputs.length === 0) {
		throw new Error("Test harness requires at least one worker.");
	}

	const previousSessions = new Map(
		previousWorkers.map(({ options, remoteProxySessionData }) => [
			options.config.name,
			remoteProxySessionData,
		])
	);
	const workers: ResolvedWorker[] = [];
	try {
		// One at a time, so a failure leaves no remote session still starting
		for (const input of inputs) {
			workers.push(await resolveWorker(ctx, root, input, previousSessions));
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
 * Resolves one Worker in a project's Build Output for Miniflare. A test-only
 * Worker is already Miniflare config, so Miniflare runs it as given.
 *
 * @param ctx The harness's state
 * @param root The directory that a relative `projectDir` path resolves from
 * @param input The Worker to run, and its test values
 * @param previousSessions The remote sessions of the Workers these replace,
 * by Worker name
 * @returns The Worker's Miniflare options and remote bindings session
 */
async function resolveWorker(
	ctx: HarnessContext,
	root: string,
	input: WorkerInput,
	previousSessions: Map<string, RemoteProxySessionData | null>
): Promise<ResolvedWorker> {
	if ("config" in input) {
		return {
			projectDir: root,
			options: { config: input.config },
			remoteProxySessionData: null,
		};
	}

	const projectDir = path.resolve(root, toPath(input.projectDir));
	const buildOutput = await readBuildOutput(projectDir);
	const worker = findWorker(buildOutput, input.name);
	const settings = buildOutput.rootConfig.settings ?? {};
	const testBindings = input.envOverrides;

	// Secrets come from the files for the build's mode, as in `vite preview`
	const mode = buildOutput.rootConfig.buildContext.mode ?? "production";
	const [localEnv, devVars] = await Promise.all([
		loadEnv(projectDir, mode),
		loadDevVars(projectDir, mode),
	]);
	const {
		manifest: _manifest,
		assets,
		env: configuredEnv,
		exports: _exports,
		...config
	} = worker.config;
	// As in production, a Worker only has the bindings its config declares. A
	// test replaces one with a binding that can stand in for it.
	for (const [name, { type }] of Object.entries(testBindings ?? {})) {
		const declaredType = configuredEnv?.[name]?.type;
		if (declaredType === undefined) {
			const declaredNames = Object.keys(configuredEnv ?? {});
			throw new Error(
				`\`envOverrides\` names "${name}", which isn't a binding of Worker "${config.name}".` +
					(declaredNames.length > 0
						? ` It has: ${declaredNames.join(", ")}.`
						: " It has no bindings.")
			);
		}
		if (["text", "json", "secret"].includes(declaredType)) {
			if (type !== "text" && type !== "json") {
				throw new Error(
					`\`envOverrides\` can't replace binding "${name}" of type "${declaredType}" with one of type "${type}". Use \`bindings.text()\` or \`bindings.json()\`.`
				);
			}
		} else if (declaredType === "durable-object") {
			// A Worker's RPC methods return promises, so it can't stand in for a
			// namespace, whose idFromName() and get() return synchronously
			if (type !== "durable-object") {
				throw new Error(
					`\`envOverrides\` can't replace binding "${name}" of type "durable-object" with one of type "${type}". Use another Durable Object binding.`
				);
			}
		} else if (type !== declaredType && type !== "worker") {
			throw new Error(
				`\`envOverrides\` can't replace binding "${name}" of type "${declaredType}" with one of type "${type}". Use type "${declaredType}", or \`bindings.worker()\` to mock it.`
			);
		}
	}
	// Test bindings replace configured ones before anything uses them, so an
	// overridden remote binding doesn't start a remote session
	const testEnv = { ...configuredEnv, ...testBindings };
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
			ctx,
			buildOutput.containers,
			worker.config.exports,
			settings
		),
	});
	const manifest = await getManifest(worker);

	const session = await maybeStartOrUpdateRemoteProxySession(
		{
			name: config.name,
			target: "cf",
			env: testEnv,
			complianceRegion: toApiComplianceRegion(settings.complianceRegion),
		},
		previousSessions.get(config.name) ?? null,
		getRemoteBindingsAuth(ctx, projectDir, settings.accountId),
		{ cliDisplayName: "cf", logger: ctx.logger }
	);

	return {
		projectDir,
		options: {
			config: {
				...config,
				env,
				exports,
				// An assets-only Worker has no code of its own
				manifest: manifest ?? {
					mainModule: "index.mjs",
					modules: {
						"index.mjs": { type: "esm", contents: "export default {};" },
					},
				},
				assets:
					worker.assetsDir === undefined
						? undefined
						: {
								...assets,
								directory: worker.assetsDir,
								hasUserWorker: manifest !== undefined,
							},
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
 * @param buildOutput A project's Build Output
 * @param name The Worker's name, or none for the build's default Worker
 * @returns The Worker
 */
function findWorker(
	buildOutput: BuildOutput,
	name: string | undefined
): BuildOutputWorker {
	const builtWorkers = Object.values(buildOutput.workers);
	const worker =
		name === undefined
			? buildOutput.workers.default
			: builtWorkers.find(({ config }) => config.name === name);
	if (worker === undefined) {
		throw new Error(
			`No Worker named "${name}" in the Build Output at ${buildOutput.root}. It has: ${builtWorkers.map(({ config }) => config.name).join(", ")}.`
		);
	}
	return worker;
}

/**
 * Reads a Worker's modules from its Build Output bundle.
 *
 * @param worker The Worker in the Build Output
 * @returns The Worker's module manifest, or none if, as `vite preview` treats
 * it, the Worker has no code of its own
 */
async function getManifest(
	worker: BuildOutputWorker
): Promise<NonNullable<WorkerOptions["config"]["manifest"]> | undefined> {
	const { manifest } = worker.config;
	if (manifest === undefined || worker.bundleDir === undefined) {
		return undefined;
	}

	const { bundleDir } = worker;
	const modules: NonNullable<WorkerOptions["config"]["manifest"]>["modules"] =
		{};
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
 * @param ctx The harness's state
 * @param containers The Containers in the Worker's Build Output
 * @param exports The Worker's exports
 * @param settings The build's account and compliance region
 * @returns The local runtime options of each Container-backed export
 */
async function prepareContainers(
	ctx: HarnessContext,
	containers: BuildOutput["containers"],
	exports: BuildOutputWorker["config"]["exports"],
	settings: NonNullable<BuildOutput["rootConfig"]["settings"]>
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
	if (!ctx.preparedContainerImages.has(preparationKey)) {
		await prepareContainerImagesForCfConfig({
			...preparation,
			logger: ctx.logger,
			operation: "running tests",
		});
		ctx.preparedContainerImages.add(preparationKey);
	}
	return plan.containerRuntimeOptions;
}

/**
 * @param value A path, or a `file:` URL
 * @returns The path
 */
function toPath(value: string | URL): string {
	return value instanceof URL ? fileURLToPath(value) : value;
}
