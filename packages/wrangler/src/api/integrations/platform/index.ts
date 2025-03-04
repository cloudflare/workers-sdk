import assert from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path, { join, resolve } from "node:path";
import { kCurrentWorker } from "miniflare";
import { getAssetsOptions } from "../../../assets";
import { readConfig } from "../../../config";
import { DEFAULT_MODULE_RULES } from "../../../deployment-bundle/rules";
import { getBindings } from "../../../dev";
import { getClassNamesWhichUseSQLite } from "../../../dev/class-names-sqlite";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	buildSitesOptions,
} from "../../../dev/miniflare";
import { run } from "../../../experimental-flags";
import { getWranglerTmpDir } from "../../../paths";
import { getLegacyAssetPaths, getSiteAssetPaths } from "../../../sites";
import { dedent } from "../../../utils/dedent";
import { startWorker } from "../../startDevWorker";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import type { Config, RawConfig, RawEnvironment } from "../../../config";
import type { StartDevWorkerInput, Worker } from "../../startDevWorker";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type { ModuleRule, WorkerOptions } from "miniflare";

export { readConfig as unstable_readConfig };
export type {
	Config as Unstable_Config,
	RawConfig as Unstable_RawConfig,
	RawEnvironment as Unstable_RawEnvironment,
};

/**
 * Options for the `getPlatformProxy` utility
 */
export type GetPlatformProxyOptions = {
	/**
	 * The name of the environment to use
	 */
	environment?: string;
	/**
	 * The path to the config file to use.
	 * If no path is specified the default behavior is to search from the
	 * current directory up the filesystem for a Wrangler configuration file to use.
	 *
	 * Note: this field is optional but if a path is specified it must
	 *       point to a valid file on the filesystem
	 */
	configPath?: string;

	/**
	 * stuff that we do want to run in workerd
	 * e.g. durable objects, workflows, named entrypoints
	 * NOT anything on the default export which can (sort of) be run in node
	 * (TODO: re-export to override a default export if provided)
	 * useMain just means we use `main` as specified in the config file
	 */
	exportsPath?: string | { useMain: true };
	/**
	 * Indicates if and where to persist the bindings data, if not present or `true` it defaults to the same location
	 * used by wrangler v3: `.wrangler/state/v3` (so that the same data can be easily used by the caller and wrangler).
	 * If `false` is specified no data is persisted on the filesystem.
	 */
	persist?: boolean | { path: string };
};

/**
 * Result of the `getPlatformProxy` utility
 */
export type PlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
> = {
	/**
	 * Environment object containing the various Cloudflare bindings
	 */
	env: Env;
	/**
	 * Mock of the context object that Workers received in their request handler, all the object's methods are no-op
	 */
	cf: CfProperties;
	/**
	 * Mock of the context object that Workers received in their request handler, all the object's methods are no-op
	 */
	ctx: ExecutionContext;
	/**
	 * Caches object emulating the Workers Cache runtime API
	 */
	caches: CacheStorage;
	/**
	 * Function used to dispose of the child process providing the bindings implementation
	 */
	dispose: () => Promise<void>;
};

/**
 * By reading from a Wrangler configuration file this function generates proxy objects that can be
 * used to simulate the interaction with the Cloudflare platform during local development
 * in a Node.js environment
 *
 * @param options The various options that can tweak this function's behavior
 * @returns An Object containing the generated proxies alongside other related utilities
 */

/**
 * The running worker instances with their reference count
 */
const workers = new Map<Worker, number>();

export async function getPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
>(
	options: GetPlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	const config = readConfig({
		config: options.configPath,
		env: options.environment,
	});

	assert(config.configPath);

	// Ensure the assets directory exists D:
	// temp fix not good
	if (config.assets?.directory && !existsSync(config.assets?.directory)) {
		mkdirSync(config.assets?.directory, { recursive: true });
	}

	const tmpDir = getWranglerTmpDir(
		path.dirname(config.configPath),
		"get-platform-proxy"
	);
	const entrypoint = join(tmpDir.path, "/index.js");
	let namedExports = "";
	if (typeof options.exportsPath === "string") {
		const exportsToEntrypoint = resolve(entrypoint, options.exportsPath);
		namedExports = `export * from "${exportsToEntrypoint}";`;
	} else if (options.exportsPath?.useMain) {
		assert(config.main);
		const mainToEntrypoint = resolve(entrypoint, config.main);
		namedExports = `export * from "${mainToEntrypoint}";`;
	}
	// write a no-op file to preserve old behavior where no script is used
	writeFileSync(
		entrypoint,
		dedent`${namedExports}
		export default {
		async fetch() {
		return new Response("no-op")
		}};`
	);
	return await run(
		{
			MULTIWORKER: false,
			RESOURCES_PROVISION: false,
		},
		async () => {
			// todo investigate middleware and whether we should load it
			const input: StartDevWorkerInput = {
				config: options.configPath,
				entrypoint,
				env: options.environment,
				dev: {
					watch: false,
					inspector: {
						port: 0,
					},
					server: {
						port: 0,
					},
					logLevel: "error",
					liveReload: false,
					persist:
						typeof options.persist === "object"
							? options.persist.path
							: options.persist
								? ".wrangler/state/v3"
								: null,
				},
				build: {
					custom: {},
				},
			};

			// Find an existing worker with the same input
			let worker = Array.from(workers.keys()).find((w) => {
				return JSON.stringify(w.input) === JSON.stringify(input);
			});

			// Start a new worker if none was found
			if (!worker) {
				worker = await startWorker(input);
			}

			// Update the reference count
			workers.set(worker, (workers.get(worker) ?? 0) + 1);

			const { env, cf } = await worker.getPlatformProxy();
			deepFreeze(cf);
			return {
				env: env as Env,
				cf: cf as CfProperties,
				ctx: new ExecutionContext(),
				caches: new CacheStorage(),
				dispose: async () => {
					const count = workers.get(worker);

					if (count !== undefined) {
						// Don't dispose the worker if it's still in use
						if (count > 1) {
							workers.set(worker, count - 1);
							return;
						}

						// Remove the worker from the map before disposing it
						workers.delete(worker);
					}

					await worker.dispose();
				},
			};
		}
	);
}

function deepFreeze<T extends Record<string | number | symbol, unknown>>(
	obj: T
): void {
	Object.freeze(obj);
	Object.entries(obj).forEach(([, prop]) => {
		if (prop !== null && typeof prop === "object" && !Object.isFrozen(prop)) {
			deepFreeze(prop as Record<string | number | symbol, unknown>);
		}
	});
}

export type SourcelessWorkerOptions = Omit<
	WorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
> & { modulesRules?: ModuleRule[] };

export interface Unstable_MiniflareWorkerOptions {
	workerOptions: SourcelessWorkerOptions;
	define: Record<string, string>;
	main?: string;
}

export function unstable_getMiniflareWorkerOptions(
	configPath: string,
	env?: string
): Unstable_MiniflareWorkerOptions;
export function unstable_getMiniflareWorkerOptions(
	config: Config,
	env?: string
): Unstable_MiniflareWorkerOptions;
export function unstable_getMiniflareWorkerOptions(
	configOrConfigPath: string | Config,
	env?: string
): Unstable_MiniflareWorkerOptions {
	const config =
		typeof configOrConfigPath === "string"
			? readConfig({ config: configOrConfigPath, env })
			: configOrConfigPath;

	const modulesRules: ModuleRule[] = config.rules
		.concat(DEFAULT_MODULE_RULES)
		.map((rule) => ({
			type: rule.type,
			include: rule.globs,
			fallthrough: rule.fallthrough,
		}));

	const bindings = getBindings(config, env, true, {});
	const { bindingOptions } = buildMiniflareBindingOptions({
		name: undefined,
		bindings,
		workerDefinitions: undefined,
		queueConsumers: config.queues.consumers,
		services: [],
		serviceBindings: {},
		migrations: config.migrations,
		imagesLocalMode: false,
	});

	// This function is currently only exported for the Workers Vitest pool.
	// In tests, we don't want to rely on the dev registry, as we can't guarantee
	// which sessions will be running. Instead, we rewrite `serviceBindings` and
	// `durableObjects` to use more traditional Miniflare config expecting the
	// user to define workers with the required names in the `workers` array.
	// These will run the same `workerd` processes as tests.
	if (bindings.services !== undefined) {
		bindingOptions.serviceBindings = Object.fromEntries(
			bindings.services.map((binding) => {
				const name =
					binding.service === config.name ? kCurrentWorker : binding.service;
				return [binding.binding, { name, entrypoint: binding.entrypoint }];
			})
		);
	}
	if (bindings.durable_objects !== undefined) {
		type DurableObjectDefinition = NonNullable<
			typeof bindingOptions.durableObjects
		>[string];

		const classNameToUseSQLite = getClassNamesWhichUseSQLite(config.migrations);

		bindingOptions.durableObjects = Object.fromEntries(
			bindings.durable_objects.bindings.map((binding) => {
				const useSQLite = classNameToUseSQLite.get(binding.class_name);
				return [
					binding.name,
					{
						className: binding.class_name,
						scriptName: binding.script_name,
						useSQLite,
					} satisfies DurableObjectDefinition,
				];
			})
		);
	}

	const legacyAssetPaths = config.legacy_assets
		? getLegacyAssetPaths(config, undefined)
		: getSiteAssetPaths(config);
	const sitesOptions = buildSitesOptions({ legacyAssetPaths });
	const processedAssetOptions = getAssetsOptions({ assets: undefined }, config);
	const assetOptions = processedAssetOptions
		? buildAssetOptions({ assets: processedAssetOptions })
		: {};

	const workerOptions: SourcelessWorkerOptions = {
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		modulesRules,

		...bindingOptions,
		...sitesOptions,
		...assetOptions,
	};

	return { workerOptions, define: config.define, main: config.main };
}
