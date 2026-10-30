import assert from "node:assert";
import path from "node:path";
import util from "node:util";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	DEFAULT_COMPAT_DATE,
	DEFAULT_MODULE_RULES,
	formatZodError,
	getCloudflareComplianceRegion,
} from "@cloudflare/workers-utils";
import {
	convertV4MiniflareOptions,
	kCurrentWorker,
	Log,
	LogLevel,
	mergeWorkerOptions,
	V4WorkerOptionsSchema,
} from "miniflare";
import { z } from "zod";
import {
	getProjectPath,
	getRelativeProjectConfigPath,
	getRelativeProjectPath,
	getRunnerName,
	WORKER_NAME_PREFIX,
} from "./helpers";
import {
	loadNewConfig,
	mergeCloudflareConfigWorker,
	NEW_CONFIG_FILENAME,
} from "./new-config";
import type { LoadedNewConfig } from "./new-config";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { Config } from "@cloudflare/workers-utils";
import type {
	LegacyWorkerOptions,
	RemoteProxyConnectionString,
	V4ModuleRule,
	WorkerOptions,
} from "miniflare";
import type { TestProject } from "vitest/node";
import type { ZodError } from "zod";

export interface WorkersConfigPluginAPI {
	setMain(newMain?: string): void;
}

const WorkersPoolOptionsSchema = z.object({
	/**
	 * Entrypoint to Worker run in the same isolate/context as tests. This is
	 * required to use `import { exports } from "cloudflare:workers"`, or Durable
	 * Objects without an explicit `scriptName`. Note this goes through Vite
	 * transforms and can be a TypeScript file. Note also
	 * `import module from "<path-to-main>"` inside tests gives exactly the same
	 * `module` instance as is used internally for the `SELF` and Durable Object
	 * bindings.
	 */
	main: z.string().optional(),
	/**
	 * Enables remote bindings to access remote resources configured
	 * with `remote: true` in the wrangler configuration file, or
	 * `dev: { remote: true }` in `cloudflare.config.ts`.
	 */
	remoteBindings: z.boolean().default(true),
	/**
	 * Enables verbose workerd logging. Defaults to `true`.
	 */
	verbose: z.boolean().optional(),
	/**
	 * Additional exports.
	 * A map of module exports to be made available on the `ctx.exports`
	 * that cannot be automatically inferred by analyzing the Worker source code.
	 *
	 * This is useful for exports that are re-exported implicitly, for example
	 * through wildcard (`export * from "..."`) re-exports from virtual modules.
	 */
	additionalExports: z
		.record(
			z.string(),
			z.union([
				z.literal("WorkerEntrypoint"),
				z.literal("DurableObject"),
				z.literal("WorkflowEntrypoint"),
			])
		)
		.default({}),
	miniflare: z
		.looseObject({
			workers: z.array(z.looseObject({})).optional(),
		})
		.optional(),
	wrangler: z
		.object({
			configPath: z.string().optional(),
			environment: z.string().optional(),
		})
		.optional(),
	/**
	 * Load the Worker's configuration from a `cloudflare.config.ts` file
	 * instead of a Wrangler configuration file. Cannot be combined with
	 * `wrangler`. `miniflare` options are merged over the config's Worker.
	 *
	 * Pass `true` to load `cloudflare.config.ts` from the project root, or a
	 * path to the file, resolved relative to the project root.
	 *
	 * Config functions are called with `ctx.mode` set to Vite's mode, which
	 * defaults to `"test"` and can be overridden with `--mode`.
	 */
	config: z.union([z.boolean(), z.string().min(1)]).optional(),
});

type CompatibleWorkerOptions = LegacyWorkerOptions & {
	/** @deprecated Use `cacheAPI` instead. */
	cache?: LegacyWorkerOptions["cacheAPI"];
};

export type SourcelessWorkerOptions = Omit<
	CompatibleWorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
> & {
	// `modulesRules` is not included in all members of the `SourceOptions` type
	// from which `WorkerOptions` is derived. Therefore, we manually include it.
	modulesRules?: V4ModuleRule[];
};

export type WorkersPoolOptions = z.input<typeof WorkersPoolOptionsSchema> & {
	miniflare?: SourcelessWorkerOptions & {
		workers?: CompatibleWorkerOptions[];
	};
};

export type WorkersPoolOptionsWithDefines = WorkersPoolOptions & {
	defines?: Record<string, string>;
	moduleRules?: V4ModuleRule[];
	/**
	 * Details of the configuration file these options were resolved from. Set
	 * while parsing; not a user-facing option. Undefined when the project
	 * configures the Worker entirely through `miniflare` options.
	 */
	resolvedConfig?: {
		/** Absolute path of the configuration file. */
		path: string;
		/**
		 * Whether that file is a `cloudflare.config.ts` rather than a Wrangler
		 * configuration file. Determines how config fields are named in errors.
		 */
		newConfig: boolean;
		/**
		 * The Worker name declared in the configuration file, before any
		 * environment name is appended. Self-referential service and tail
		 * bindings are written against this name.
		 */
		workerName: string | undefined;
		/**
		 * The effective Worker name after selecting a Wrangler environment.
		 * Durable Object and Workflow script names target this name without
		 * environment rewriting.
		 */
		effectiveWorkerName: string | undefined;
	};
	/**
	 * The Worker under test, then the auxiliary Workers, resolved from the
	 * configuration file and `miniflare` options in Miniflare's native shape.
	 * Set while parsing; not a user-facing option.
	 */
	projectWorkers?: ProjectWorkers;
};

function normalizeMiniflareWorkerOptions(value: Record<string, unknown>): void {
	if (value.cacheAPI === undefined) {
		value.cacheAPI = value.cache;
	}
	delete value.cache;
}

function getRootPath(value: Record<string, unknown>): string {
	return typeof value.rootPath === "string" ? value.rootPath : "";
}

function prefixZodIssuePaths(
	error: ZodError,
	zodPath: (string | number)[]
): void {
	for (const issue of error.issues) {
		(issue as { path: (string | number)[] }).path = [
			...zodPath,
			...(issue.path as (string | number)[]),
		];
	}
}

function isZodErrorLike(value: unknown): value is ZodError {
	return (
		typeof value === "object" &&
		value !== null &&
		"issues" in value &&
		Array.isArray(value.issues)
	);
}

type ZodErrorRef = { value?: ZodError };
function coalesceZodErrors(ref: ZodErrorRef, thrown: unknown) {
	if (!isZodErrorLike(thrown)) {
		throw thrown;
	}
	if (ref.value === undefined) {
		ref.value = thrown;
	} else {
		ref.value.issues.push(...thrown.issues);
	}
}

function parseWorkerOptions(
	rootPath: string,
	value: Record<string, unknown>,
	withoutScript: boolean,
	zodPath: (string | number)[]
): LegacyWorkerOptions {
	normalizeMiniflareWorkerOptions(value);

	// If this worker shouldn't have a configurable script, remove all script data
	// and replace it with an empty `script` that will pass validation
	if (withoutScript) {
		value["script"] = "";
		delete value["scriptPath"];
		delete value["modules"];
		delete value["modulesRoot"];
	}

	let result: LegacyWorkerOptions;
	try {
		result = V4WorkerOptionsSchema.parse(value) as LegacyWorkerOptions;
	} catch (e) {
		if (isZodErrorLike(e)) {
			prefixZodIssuePaths(e, zodPath);
		}
		throw e;
	}
	if (result.rootPath === undefined) {
		result.rootPath = rootPath;
	}

	// Remove the placeholder script added if any
	if (withoutScript) {
		delete value["script"];
	}
	return result;
}

const log = new Log(LogLevel.WARN, { prefix: "vpw" });
const debug = util.debuglog("vitest-plugin");

const remoteBindingsLogger: RemoteBindingsLogger = {
	loggerLevel: "log",
	debug: console.debug,
	log: console.log,
	info: console.info,
	warn: console.warn,
	error: console.error,
	console(method, ...args) {
		Reflect.apply(console[method], console, args);
	},
};

// function warnDeprecatedModuleRules(): void {
// 	log.warn(
// 		"`cloudflareTest({ miniflare: { modulesRules } })` is deprecated and will be removed in a future version. Prefer Vite import query suffixes such as `?raw` where possible."
// 	);
// }

function filterTails(
	tails: WorkerOptions["config"]["tailConsumers"],
	auxiliaryWorkers: WorkerOptions[]
) {
	// Only connect the tail consumers that represent Workers that are defined in the Vitest config. Warn that a tail will be omitted otherwise
	// This _differs from service bindings_ because tail consumers are "optional" in a sense, and shouldn't affect the runtime behaviour of a Worker
	const seen = new Set<string>();
	return tails?.filter((tail) => {
		// The configuration file and `miniflare` options may name the same tail consumer
		const key = JSON.stringify([
			tail.worker,
			tail.streaming ?? false,
			tail.entrypoint,
			tail.props,
		]);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);

		const found = auxiliaryWorkers.some(
			(auxiliaryWorker) => auxiliaryWorker.config.name === tail.worker
		);

		if (!found) {
			log.warn(
				`Tail consumer "${tail.worker}" was not found in \`miniflare.workers\`. Make sure you add it if you'd like to simulate receiving tail events locally.`
			);
		}

		return found;
	});
}

/** Map that maps worker configPaths to their existing remote proxy session data (if any) */
export const remoteProxySessionsDataMap = new Map<
	string,
	RemoteProxySessionData | null
>();

/**
 * Disposes every remote proxy session and clears the map.
 *
 * Sessions are shared across pool workers by config path and
 * consecutive workers overlap, so this is only safe to call once the last
 * pool worker has stopped — calling it earlier would dispose sessions that
 * later workers still depend on.
 */
export async function disposeAllRemoteProxySessions(): Promise<void> {
	const sessions = [...remoteProxySessionsDataMap.values()];
	remoteProxySessionsDataMap.clear();
	await Promise.all(sessions.map((data) => data?.session.dispose()));
}

/**
 * Normalise the `config` option into its resolved form.
 *
 * @param option The user-provided option value.
 * @returns The resolved options, or `undefined` when `cloudflare.config.ts`
 * shouldn't be loaded.
 */
function normalizeNewConfigOption(
	option: boolean | string | undefined
): { configPath: string } | undefined {
	if (option === undefined || option === false) {
		return undefined;
	}
	if (option === true) {
		return { configPath: NEW_CONFIG_FILENAME };
	}
	return { configPath: option };
}

export type ProjectWorkers = [
	runnerWorker: WorkerOptions,
	...auxiliaryWorkers: WorkerOptions[],
];

/**
 * Converts the Worker under test and any auxiliary Workers, configured with
 * `wrangler` or `miniflare` options in Miniflare's V4 shape, to its native
 * shape.
 *
 * @param project The Vitest project.
 * @param options The project's parsed pool options.
 * @param workerName The name to convert the Worker under test with. Bindings
 * that name it are converted as bindings to itself.
 * @param configCompatibilityDate The compatibility date in `cloudflare.config.ts`, if any.
 * @returns The Worker under test, followed by the auxiliary Workers.
 */
function convertUserWorkers(
	project: TestProject,
	options: WorkersPoolOptionsWithDefines,
	workerName: string,
	configCompatibilityDate: string | undefined
): ProjectWorkers {
	const { workers = [], ...worker } = options.miniflare ?? {};

	for (const [i, auxiliaryWorker] of workers.entries()) {
		const name: unknown = (auxiliaryWorker as { name?: unknown }).name;
		// Make sure the worker has a non-empty name...
		if (typeof name !== "string" || name === "") {
			throw new Error(
				`In project ${getRelativeProjectPath(
					project
				)}, \`miniflare.workers[${i}].name\` must be non-empty`
			);
		}
		// ...that doesn't start with our reserved prefix
		if (name.startsWith(WORKER_NAME_PREFIX)) {
			throw new Error(
				`In project ${getRelativeProjectPath(
					project
				)}, \`miniflare.workers[${i}].name\` must not start with "${WORKER_NAME_PREFIX}", got ${name}`
			);
		}
	}

	// `miniflare` options override the compatibility date in `cloudflare.config.ts`
	let compatibilityDate = worker.compatibilityDate ?? configCompatibilityDate;
	if (compatibilityDate === undefined) {
		// No compatibility date was provided, so use the default
		compatibilityDate = DEFAULT_COMPAT_DATE;
		debug(
			"No compatibility date was provided for project %s, defaulting to %s.",
			getRelativeProjectPath(project),
			compatibilityDate
		);
	}

	let converted: WorkerOptions[];
	try {
		// Miniflare validates the auxiliary Workers' options
		({ workers: converted = [] } = convertV4MiniflareOptions({
			workers: [
				// Conversion requires a source, so give the Worker under test an empty
				// one. The runner's own modules replace it.
				{
					...worker,
					name: workerName,
					compatibilityDate,
					script: "",
					modules: true,
				} as LegacyWorkerOptions,
				...(workers as LegacyWorkerOptions[]),
			],
		}));
	} catch (e) {
		// Options from a configuration file can fail here too, so don't let
		// `parseProjectOptions()` report this as an error in the pool's options
		throw isZodErrorLike(e) ? new Error(formatZodError(e), { cause: e }) : e;
	}
	const [userWorker, ...auxiliaryWorkers] = converted;
	assert(userWorker !== undefined);
	return [userWorker, ...auxiliaryWorkers];
}

/**
 * Points the bindings of the Worker under test that target the Worker itself at
 * the runner, which is renamed. Service bindings use `kCurrentWorker`, which
 * resolves relative to the calling Worker.
 *
 * @param worker The Worker under test.
 * @param configWorkerName The Worker's top-level name in its configuration
 *   file, if it has one.
 * @param effectiveWorkerName The Worker's name with its Wrangler environment
 *   applied.
 * @param runnerName Name of the runner Worker.
 */
function pointSelfBindingsAtRunner(
	worker: WorkerOptions,
	configWorkerName: string | undefined,
	effectiveWorkerName: string,
	runnerName: string
): void {
	const env = worker.config.env ?? {};
	for (const [name, binding] of Object.entries(env)) {
		if (binding.type === "worker" && binding.worker === configWorkerName) {
			env[name] = { ...binding, worker: kCurrentWorker };
		} else if (
			// Durable Objects and Workflows target the effective name, so a binding
			// to the base Worker from a named environment stays external
			(binding.type === "durable-object" || binding.type === "workflow") &&
			binding.worker === effectiveWorkerName
		) {
			env[name] = { ...binding, worker: runnerName };
		}
	}
}

/**
 * Points an auxiliary Worker's streaming tail consumers that target the Worker
 * under test's configured name at the runner, which is renamed.
 *
 * @param worker An auxiliary Worker.
 * @param configWorkerName The Worker under test's name in its configuration file.
 * @param runnerName Name of the runner Worker.
 */
function pointStreamingTailsAtRunner(
	worker: WorkerOptions,
	configWorkerName: string,
	runnerName: string
): void {
	worker.config.tailConsumers = worker.config.tailConsumers?.map((tail) =>
		tail.streaming && tail.worker === configWorkerName
			? { ...tail, worker: runnerName }
			: tail
	);
}

/**
 * Resolves the Worker under test and the auxiliary Workers in Miniflare's
 * native shape, from `miniflare` options and the project's configuration file.
 * The Worker under test takes the runner's name, and references to its
 * configured name are pointed at the runner.
 *
 * @param project The Vitest project.
 * @param options The project's parsed pool options.
 * @param cloudflareConfig The `cloudflare.config.ts` loaded for `config`, if any.
 * @param remoteProxyConnectionString The config's remote proxy session, if any.
 * @returns The Worker under test, followed by the auxiliary Workers.
 */
function resolveProjectWorkers(
	project: TestProject,
	options: WorkersPoolOptionsWithDefines,
	cloudflareConfig: LoadedNewConfig | undefined,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): ProjectWorkers {
	const runnerName = getRunnerName(project);
	const configWorkerName = options.resolvedConfig?.workerName;
	const effectiveWorkerName = options.resolvedConfig?.effectiveWorkerName;
	const [convertedWorker, ...auxiliaryWorkers] = convertUserWorkers(
		project,
		options,
		effectiveWorkerName || runnerName,
		cloudflareConfig?.worker.compatibilityDate
	);
	const worker =
		cloudflareConfig === undefined
			? convertedWorker
			: mergeCloudflareConfigWorker(convertedWorker, cloudflareConfig, {
					remoteBindings: options.remoteBindings,
					remoteProxyConnectionString,
				});

	worker.config.tailConsumers = filterTails(
		worker.config.tailConsumers,
		auxiliaryWorkers
	);

	// The runner replaces the Worker under test, so it takes the runner's name
	worker.config.name = runnerName;
	// A Wrangler environment can name the Worker when the top level doesn't
	if (effectiveWorkerName) {
		pointSelfBindingsAtRunner(
			worker,
			configWorkerName,
			effectiveWorkerName,
			runnerName
		);
	}
	if (configWorkerName) {
		for (const auxiliaryWorker of auxiliaryWorkers) {
			pointStreamingTailsAtRunner(
				auxiliaryWorker,
				configWorkerName,
				runnerName
			);
		}
	}

	return [worker, ...auxiliaryWorkers];
}

async function parseCustomPoolOptions(
	project: TestProject,
	rootPath: string,
	value: unknown,
	mode: string,
	envDir: string | false
): Promise<WorkersPoolOptionsWithDefines> {
	// The schema strips unknown options, so `experimental.newConfig` would
	// otherwise be ignored silently
	if (
		(value as { experimental?: { newConfig?: unknown } } | undefined)
			?.experimental?.newConfig !== undefined
	) {
		throw new TypeError(
			'`experimental.newConfig` is now the `config` option. Replace `experimental: { newConfig: ... }` with `config: true`, or `config: "<path>"` for a custom path.'
		);
	}

	// Try to parse pool specific options
	const options = WorkersPoolOptionsSchema.parse(
		value
	) as WorkersPoolOptionsWithDefines;
	options.miniflare ??= {};
	const miniflareModuleRules = options.miniflare.modulesRules;

	// Try to parse runner worker options, coalescing all errors
	const errorRef: ZodErrorRef = {};
	const workers = options.miniflare?.workers;
	const rootPathOption = getRootPath(options.miniflare);
	rootPath = path.resolve(rootPath, rootPathOption);
	try {
		options.miniflare = parseWorkerOptions(
			rootPath,
			options.miniflare,
			/* withoutScript */ true, // (script provided by runner)
			["miniflare"]
		);
	} catch (e) {
		coalesceZodErrors(errorRef, e);
	}
	options.miniflare.rootPath = rootPath;

	options.miniflare.workers = [];
	// Try to parse auxiliary worker options
	if (workers !== undefined) {
		options.miniflare.workers = workers.map((worker, i) => {
			try {
				const workerRootPathOption = getRootPath(worker);
				const workerRootPath = path.resolve(rootPath, workerRootPathOption);
				const parsed = parseWorkerOptions(
					workerRootPath,
					worker,
					/* withoutScript */ false,
					["miniflare", "workers", i]
				);
				parsed.rootPath = workerRootPath;
				return parsed;
			} catch (e) {
				coalesceZodErrors(errorRef, e);
				return { script: "" }; // (ignored as we'll be throwing)
			}
		});
	}

	if (errorRef.value !== undefined) {
		throw errorRef.value;
	}
	options.moduleRules = miniflareModuleRules;
	delete options.miniflare.modulesRules;

	// Try to parse the project's configuration file, whichever format it uses
	const newConfig = normalizeNewConfigOption(options.config);

	if (newConfig !== undefined && options.wrangler !== undefined) {
		throw new TypeError(
			"`wrangler` can't be used with `config`. Set `config` to use `cloudflare.config.ts`, or `wrangler` to use a Wrangler configuration file."
		);
	}

	let configPath: string | undefined;
	let config: Config | undefined;
	// Wrangler environments have no `cloudflare.config.ts` equivalent yet
	let environment: string | undefined;
	let cloudflareConfig: LoadedNewConfig | undefined;
	let remoteProxyConnectionString: RemoteProxyConnectionString | undefined;

	if (newConfig !== undefined) {
		configPath = path.resolve(rootPath, newConfig.configPath);
		cloudflareConfig = await loadNewConfig(configPath, mode, envDir);
		const { worker, settings } = cloudflareConfig;
		options.resolvedConfig = {
			path: configPath,
			newConfig: true,
			workerName: worker.name,
			effectiveWorkerName: worker.name,
		};

		const preExistingRemoteProxySessionData =
			remoteProxySessionsDataMap.get(configPath);
		const remoteProxySessionData = options.remoteBindings
			? await maybeStartOrUpdateRemoteProxySession(
					{
						name: worker.name,
						target: "cf",
						env: worker.env,
						complianceRegion:
							settings.complianceRegion === "fedramp-high"
								? "fedramp_high"
								: settings.complianceRegion,
					},
					preExistingRemoteProxySessionData ?? null,
					undefined,
					{ cliDisplayName: "cf", logger: remoteBindingsLogger }
				)
			: null;
		if (remoteProxySessionData) {
			remoteProxySessionsDataMap.set(configPath, remoteProxySessionData);
		}
		remoteProxyConnectionString =
			remoteProxySessionData?.session?.remoteProxyConnectionString;

		// If `main` wasn't explicitly configured, fall back to the config's entrypoint
		if (worker.entrypoint !== undefined) {
			options.main ??= path.resolve(
				path.dirname(configPath),
				worker.entrypoint
			);
		}

		// `cloudflare.config.ts` has no module rules, so `miniflare` rules come
		// before the defaults, where a Wrangler config's rules go. After them, a
		// rule for a type the defaults cover would be ignored.
		options.moduleRules = [
			...(options.moduleRules ?? []),
			...DEFAULT_MODULE_RULES.map((rule) => ({
				type: rule.type,
				include: rule.globs,
				fallthrough: rule.fallthrough,
			})),
		];
	} else if (options.wrangler?.configPath !== undefined) {
		configPath = path.resolve(rootPath, options.wrangler.configPath);
		// Make sure future accesses to `configPath` see a fully-resolved path
		// (e.g. for getting accurate relative paths in error messages)
		options.wrangler.configPath = configPath;
		environment = options.wrangler.environment;

		// Lazily import `wrangler` if and when we need it. Parse the config once so
		// we can pass the parsed config straight into
		// `unstable_getMiniflareWorkerOptions` without re-parsing it.
		const wrangler = await import("wrangler");
		config = wrangler.unstable_readConfig({
			config: configPath,
			env: environment,
		});
	}

	if (configPath !== undefined && config !== undefined) {
		options.resolvedConfig = {
			path: configPath,
			newConfig: false,
			workerName: config.topLevelName,
			effectiveWorkerName: config.name,
		};

		// Already imported above, so the module registry makes this a no-op
		const wrangler = await import("wrangler");

		const preExistingRemoteProxySessionData =
			remoteProxySessionsDataMap.get(configPath);

		const remoteProxySessionData = options.remoteBindings
			? await maybeStartOrUpdateRemoteProxySession(
					{
						name: config.name ?? "worker",
						bindings:
							wrangler.unstable_convertConfigBindingsToStartWorkerBindings(
								config
							) ?? {},
						complianceRegion: getCloudflareComplianceRegion(config),
						account_id: config.account_id,
						profileDir: path.dirname(configPath),
					},
					preExistingRemoteProxySessionData ?? null,
					undefined,
					{ cliDisplayName: "Wrangler", logger: remoteBindingsLogger }
				)
			: null;

		if (remoteProxySessionData) {
			remoteProxySessionsDataMap.set(configPath, remoteProxySessionData);
		}

		const { workerOptions, externalWorkers, define, main } =
			wrangler.unstable_getMiniflareWorkerOptions(config, environment, {
				overrides: {
					assets: options.miniflare.assets,
					// doesn't work with containers yet so let's just disable it
					enableContainers: false,
				},
				remoteProxyConnectionString:
					remoteProxySessionData?.session?.remoteProxyConnectionString,
			});

		// If `main` wasn't explicitly configured, fall back to the config's entrypoint
		options.main ??= main;

		options.miniflare.workers = [
			...options.miniflare.workers,
			...externalWorkers,
		];
		const {
			modulesRules: wranglerModuleRules,
			...workerOptionsWithoutModuleRules
		} = workerOptions;
		const mergedModuleRules = mergeWorkerOptions(
			{
				...(wranglerModuleRules === undefined
					? {}
					: { modulesRules: wranglerModuleRules }),
			} as SourcelessWorkerOptions,
			{
				...(options.moduleRules === undefined
					? {}
					: { modulesRules: options.moduleRules }),
			} as SourcelessWorkerOptions
		) as SourcelessWorkerOptions;
		options.moduleRules = mergedModuleRules.modulesRules;

		// Merge generated Miniflare options from the config with specified overrides
		options.miniflare = mergeWorkerOptions(
			workerOptionsWithoutModuleRules,
			options.miniflare as SourcelessWorkerOptions
		);

		// Record any `define`s from the config
		options.defines = define;
	}

	// Some assets plumbing that should be hidden from the end user
	if (options.miniflare?.assets) {
		options.miniflare.assets.routerConfig ??= {};
		options.miniflare.assets.routerConfig.has_user_worker = Boolean(
			options.main
		);
	}

	options.projectWorkers = resolveProjectWorkers(
		project,
		options,
		cloudflareConfig,
		remoteProxyConnectionString
	);

	return options;
}

export async function parseProjectOptions(
	project: TestProject,
	poolOptions: unknown
): Promise<WorkersPoolOptionsWithDefines> {
	// Make sure the user hasn't specified a custom environment. This was how
	// users enabled Miniflare 2's Vitest environment, so it's likely users will
	// hit this case.
	const environment = project.config.environment;
	if (environment !== undefined && environment !== "node") {
		const quotedEnvironment = JSON.stringify(environment);

		let migrationGuide = ".";
		if (environment === "miniflare") {
			migrationGuide =
				", and refer to the migration guide if upgrading from `vitest-environment-miniflare`:\nhttps://developers.cloudflare.com/workers/testing/vitest-integration/get-started/migrate-from-miniflare-2/";
		}

		const relativePath = getRelativeProjectPath(project);
		const message = [
			`Unexpected custom \`environment\` ${quotedEnvironment} in project ${relativePath}.`,
			"The Workers pool always runs your tests inside of an environment providing Workers runtime APIs.",
			`Please remove the \`environment\` configuration${migrationGuide}`,
		].join("\n");
		throw new TypeError(message);
	}

	const projectPath = getProjectPath(project);

	try {
		return await parseCustomPoolOptions(
			project,
			projectPath,
			poolOptions,
			// Vitest is Vite, so `cloudflare.config.ts` functions see the same mode
			// Vite would give them. Defaults to `"test"`, overridable with `--mode`.
			project.vite.config.mode,
			// Local secrets come from Vite's `envDir`, as in `@cloudflare/vite-plugin`
			project.vite.config.envDir
		);
	} catch (e) {
		if (!isZodErrorLike(e)) {
			throw e;
		}
		let formatted: string;
		try {
			formatted = formatZodError(e);
		} catch {
			throw e;
		}
		const relativePath = getRelativeProjectConfigPath(project);
		throw new TypeError(
			`Unexpected options in project ${relativePath}:\n${formatted}`
		);
	}
}
