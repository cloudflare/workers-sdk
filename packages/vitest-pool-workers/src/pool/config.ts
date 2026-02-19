import path from "node:path";
import {
	formatZodError,
	getRootPath,
	Log,
	LogLevel,
	mergeWorkerOptions,
	parseWithRootPath,
	PLUGINS,
} from "miniflare";
import { z } from "zod";
import {
	getProjectPath,
	getRelativeProjectConfigPath,
	getRelativeProjectPath,
} from "./helpers";
import type { ModuleRule, WorkerOptions } from "miniflare";
import type { TestProject } from "vitest/node";
import type { Binding, RemoteProxySession } from "wrangler";
import type { ParseParams, ZodError } from "zod";

export interface WorkersConfigPluginAPI {
	setMain(newMain?: string): void;
}

const PLUGIN_VALUES = Object.values(PLUGINS);

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
	main: z.ostring(),
	/**
	 * Enables remote bindings to access remote resources configured
	 * with `remote: true` in the wrangler configuration file.
	 */
	remoteBindings: z.boolean().default(true),
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
		.object({
			workers: z.array(z.object({}).passthrough()).optional(),
		})
		.passthrough()
		.optional(),
	wrangler: z
		.object({ configPath: z.ostring(), environment: z.ostring() })
		.optional(),
});

export type SourcelessWorkerOptions = Omit<
	WorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
> & {
	// `modulesRules` is not included in all members of the `SourceOptions` type
	// from which `WorkerOptions` is derived. Therefore, we manually include it.
	modulesRules?: ModuleRule[];
};

export type WorkersPoolOptions = z.input<typeof WorkersPoolOptionsSchema> & {
	miniflare?: SourcelessWorkerOptions & {
		workers?: WorkerOptions[];
	};
};

export type WorkersPoolOptionsWithDefines = WorkersPoolOptions & {
	defines?: Record<string, string>;
};

type PathParseParams = Pick<ParseParams, "path">;

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
	opts: PathParseParams
): WorkerOptions {
	// If this worker shouldn't have a configurable script, remove all script data
	// and replace it with an empty `script` that will pass validation
	if (withoutScript) {
		value["script"] = "";
		delete value["scriptPath"];
		delete value["modules"];
		delete value["modulesRoot"];
	}

	const result = {} as WorkerOptions;
	const errorRef: ZodErrorRef = {};
	for (const plugin of PLUGIN_VALUES) {
		try {
			// This `parse()` may throw a different `ZodError` than what we `import`
			const parsed = parseWithRootPath(rootPath, plugin.options, value, opts);
			Object.assign(result, parsed);
		} catch (e) {
			coalesceZodErrors(errorRef, e);
		}
	}
	if (errorRef.value !== undefined) {
		throw errorRef.value;
	}

	// Remove the placeholder script added if any
	if (withoutScript) {
		delete value["script"];
	}
	return result;
}

const log = new Log(LogLevel.WARN, { prefix: "vpw" });

function filterTails(
	tails: WorkerOptions["tails"],
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
const remoteProxySessionsDataMap = new Map<
	string,
	{
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
	} | null
>();

async function parseCustomPoolOptions(
	rootPath: string,
	value: unknown
): Promise<WorkersPoolOptionsWithDefines> {
	// Try to parse pool specific options
	const options = WorkersPoolOptionsSchema.parse(
		value
	) as WorkersPoolOptionsWithDefines;
	options.miniflare ??= {};

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
			{ path: ["miniflare"] }
		);
	} catch (e) {
		coalesceZodErrors(errorRef, e);
	}

	options.miniflare.workers = [];
	// Try to parse auxiliary worker options
	if (workers !== undefined) {
		options.miniflare.workers = workers.map((worker, i) => {
			try {
				const workerRootPathOption = getRootPath(worker);
				const workerRootPath = path.resolve(rootPath, workerRootPathOption);
				return parseWorkerOptions(
					workerRootPath,
					worker,
					/* withoutScript */ false,
					{
						path: ["miniflare", "workers", i],
					}
				);
			} catch (e) {
				coalesceZodErrors(errorRef, e);
				return { script: "" }; // (ignored as we'll be throwing)
			}
		});
	}

	if (errorRef.value !== undefined) {
		throw errorRef.value;
	}

	// Try to parse Wrangler config if any
	if (options.wrangler?.configPath !== undefined) {
		const configPath = path.resolve(rootPath, options.wrangler.configPath);
		// Make sure future accesses to `configPath` see a fully-resolved path
		// (e.g. for getting accurate relative paths in error messages)
		options.wrangler.configPath = configPath;

		// Lazily import `wrangler` if and when we need it
		const wrangler = await import("wrangler");

		const preExistingRemoteProxySessionData = options.wrangler?.configPath
			? remoteProxySessionsDataMap.get(options.wrangler.configPath)
			: undefined;

		const remoteProxySessionData = options.remoteBindings
			? await wrangler.maybeStartOrUpdateRemoteProxySession(
					{
						path: options.wrangler.configPath,
						environment: options.wrangler.environment,
					},
					preExistingRemoteProxySessionData ?? null
				)
			: null;

		if (options.wrangler?.configPath && remoteProxySessionData) {
			remoteProxySessionsDataMap.set(
				options.wrangler.configPath,
				remoteProxySessionData
			);
		}

		const { workerOptions, externalWorkers, define, main } =
			wrangler.unstable_getMiniflareWorkerOptions(
				configPath,
				options.wrangler.environment,
				{
					overrides: {
						assets: options.miniflare.assets,
						// doesn't work with containers yet so let's just disable it
						enableContainers: false,
					},
					remoteProxyConnectionString:
						remoteProxySessionData?.session?.remoteProxyConnectionString,
				}
			);

		// If `main` wasn't explicitly configured, fall back to Wrangler config's
		options.main ??= main;

		options.miniflare.workers = [
			...options.miniflare.workers,
			...externalWorkers,
		];

		// Merge generated Miniflare options from Wrangler with specified overrides
		options.miniflare = mergeWorkerOptions(
			workerOptions,
			options.miniflare as SourcelessWorkerOptions
		);

		options.miniflare = {
			...options.miniflare,
			tails: filterTails(workerOptions.tails, options.miniflare.workers),
		};

		// Record any Wrangler `define`s
		options.defines = define;
	}

	// Some assets plumbing that should be hidden from the end user
	if (options.miniflare?.assets) {
		// (Used to set the SELF binding to point to the router worker instead)
		options.miniflare.hasAssetsAndIsVitest = true;
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
		return await parseCustomPoolOptions(projectPath, poolOptions);
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
