import path from "node:path";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	formatZodError,
	getCloudflareComplianceRegion,
} from "@cloudflare/workers-utils";
import {
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
} from "./helpers";
import { loadNewConfig, NEW_CONFIG_FILENAME } from "./new-config";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { Config } from "@cloudflare/workers-utils";
import type { LegacyWorkerOptions, V4ModuleRule } from "miniflare";
import type { TestProject } from "vitest/node";
import type { ZodError } from "zod";

export interface WorkersConfigPluginAPI {
	setMain(newMain?: string): void;
}

const ExperimentalNewConfigSchema = z.object({
	/**
	 * Path to the `cloudflare.config.ts` file, resolved relative to the project
	 * root. Defaults to `cloudflare.config.ts` in the project root.
	 */
	configPath: z.string().optional(),
});

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
	 * with `remote: true` in the wrangler configuration file.
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
	experimental: z
		.object({
			/**
			 * Load the Worker's configuration from a `cloudflare.config.ts` file
			 * instead of a Wrangler configuration file. Cannot be combined with
			 * `wrangler`.
			 *
			 * Pass `true` to load `cloudflare.config.ts` from the project root, or
			 * an object to customise the behaviour.
			 *
			 * Config functions are called with `ctx.mode` set to Vite's mode, which
			 * defaults to `"test"` and can be overridden with `--mode`.
			 */
			newConfig: z.union([z.boolean(), ExperimentalNewConfigSchema]).optional(),
		})
		.optional(),
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
		 * environment name is appended. Self-referential service, tail and
		 * Workflow bindings are written against this name.
		 */
		workerName: string | undefined;
	};
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
	tails: LegacyWorkerOptions["tails"],
	userWorkers?: { name?: string }[]
) {
	// Only connect the tail consumers that represent Workers that are defined in the Vitest config. Warn that a tail will be omitted otherwise
	// This _differs from service bindings_ because tail consumers are "optional" in a sense, and shouldn't affect the runtime behaviour of a Worker
	return tails?.filter((tailService) => {
		let name: string;
		if (typeof tailService === "string") {
			name = tailService;
		} else if (
			typeof tailService === "object" &&
			"name" in tailService &&
			typeof tailService.name === "string"
		) {
			name = tailService.name;
		} else {
			// Don't interfere with network-based tail connections (e.g. via the dev registry), or kCurrentWorker
			return true;
		}
		const found = userWorkers?.some((w) => w.name === name);

		if (!found) {
			log.warn(
				`Tail consumer "${name}" was not found in your config. Make sure you add it if you'd like to simulate receiving tail events locally.`
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
 * Sessions are shared across pool workers by Wrangler config path and
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
 * Normalise the `experimental.newConfig` option into its resolved form.
 *
 * @param option The user-provided option value.
 * @returns The resolved options, or `undefined` when new config is disabled.
 */
function normalizeNewConfigOption(
	option: boolean | { configPath?: string } | undefined
): { configPath: string } | undefined {
	if (option === undefined || option === false) {
		return undefined;
	}
	if (option === true) {
		return { configPath: NEW_CONFIG_FILENAME };
	}
	return { configPath: option.configPath ?? NEW_CONFIG_FILENAME };
}

async function parseCustomPoolOptions(
	rootPath: string,
	value: unknown,
	mode: string | undefined
): Promise<WorkersPoolOptionsWithDefines> {
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
	const newConfig = normalizeNewConfigOption(options.experimental?.newConfig);

	if (newConfig !== undefined && options.wrangler !== undefined) {
		throw new TypeError(
			"`wrangler` cannot be used together with `experimental.newConfig`. Configure the Worker via `cloudflare.config.ts` instead."
		);
	}

	let configPath: string | undefined;
	let config: Config | undefined;
	// Wrangler environments have no `cloudflare.config.ts` equivalent yet
	let environment: string | undefined;

	if (newConfig !== undefined) {
		configPath = path.resolve(rootPath, newConfig.configPath);
		config = await loadNewConfig(configPath, mode);
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
			newConfig: newConfig !== undefined,
			workerName: config.topLevelName,
		};

		// Already imported above for a Wrangler config; the module registry makes
		// this a no-op when it was, and keeps it lazy when it wasn't
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
					{ logger: remoteBindingsLogger }
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

		options.miniflare = {
			...options.miniflare,
			tails: filterTails(
				workerOptions.tails as LegacyWorkerOptions["tails"],
				options.miniflare.workers
			),
		};

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
			projectPath,
			poolOptions,
			// Vitest is Vite, so `cloudflare.config.ts` functions see the same mode
			// Vite would give them. Defaults to `"test"`, overridable with `--mode`.
			project.vite.config.mode
		);
	} catch (e) {
		if (!isZodErrorLike(e)) {
			throw e;
		}
		let formatted: string;
		try {
			formatted = formatZodError(e, poolOptions);
		} catch {
			throw e;
		}
		const relativePath = getRelativeProjectConfigPath(project);
		throw new TypeError(
			`Unexpected options in project ${relativePath}:\n${formatted}`
		);
	}
}
