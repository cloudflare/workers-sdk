import { kCurrentWorker } from "miniflare";
import { processAssetsArg } from "../../../assets";
import { readConfig } from "../../../config";
import { DEFAULT_MODULE_RULES } from "../../../deployment-bundle/rules";
import { getBindings } from "../../../dev";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	buildSitesOptions,
} from "../../../dev/miniflare";
import { getClassNamesWhichUseSQLite } from "../../../dev/validate-dev-props";
import { getLegacyAssetPaths, getSiteAssetPaths } from "../../../sites";
import { startWorker } from "../../startDevWorker";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type { ModuleRule, WorkerOptions } from "miniflare";

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
	 * current directory up the filesystem for a `wrangler.toml` to use.
	 *
	 * Note: this field is optional but if a path is specified it must
	 *       point to a valid file on the filesystem
	 */
	configPath?: string;
	/**
	 * Flag to indicate the utility to read a json config file (`wrangler.json`/`wrangler.jsonc`)
	 * instead of the toml one (`wrangler.toml`)
	 *
	 * Note: this feature is experimental
	 */
	experimentalJsonConfig?: boolean;
	/**
	 * Indicates if and where to persist the bindings data, if not present or `true` it defaults to the same location
	 * used by wrangler v3: `.wrangler/state/v3` (so that the same data can be easily used by the caller and wrangler).
	 * If `false` is specified no data is persisted on the filesystem.
	 */
	persist?: boolean | { path: string };
	/**
	 * Use the experimental file-based dev registry for service discovery
	 *
	 * Note: this feature is experimental
	 */
	experimentalRegistry?: boolean;
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
 * By reading from a `wrangler.toml` file this function generates proxy objects that can be
 * used to simulate the interaction with the Cloudflare platform during local development
 * in a Node.js environment
 *
 * @param options The various options that can tweak this function's behavior
 * @returns An Object containing the generated proxies alongside other related utilities
 */
export async function getPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
>(
	options: GetPlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	// TODO: Allow skipping custom build

	const worker = await startWorker({
		config: options.configPath,
		env: options.environment,
		dev: {
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
						: undefined,
		},
	});

	const { env, cf } = await worker.getPlatformProxy();
	deepFreeze(cf);

	return {
		env: env as Env,
		cf: cf as CfProperties,
		ctx: new ExecutionContext(),
		caches: new CacheStorage(),
		dispose: () => worker.dispose(),
	};
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

export function unstable_getMiniflareWorkerOptions(
	configPath: string,
	env?: string
): {
	workerOptions: SourcelessWorkerOptions;
	define: Record<string, string>;
	main?: string;
} {
	// experimental json is usually enabled via a cli arg,
	// so it cannot be passed to the vitest integration.
	// instead we infer it from the config path (instead of setting a default)
	// because wrangler.json is not compatible with pages.
	const isJsonConfigFile =
		configPath.endsWith(".json") || configPath.endsWith(".jsonc");

	const config = readConfig(configPath, {
		experimentalJsonConfig: isJsonConfigFile,
		env,
	});

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
	const processedAssetOptions = processAssetsArg({ assets: undefined }, config);
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
