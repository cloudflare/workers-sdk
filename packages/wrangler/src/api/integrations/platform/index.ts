import { Miniflare } from "miniflare";
import { readConfig } from "../../../config";
import { DEFAULT_MODULE_RULES } from "../../../deployment-bundle/rules";
import { getBindings } from "../../../dev";
import { getBoundRegisteredWorkers } from "../../../dev-registry";
import { getVarsForDev } from "../../../dev/dev-vars";
import {
	buildMiniflareBindingOptions,
	buildSitesOptions,
} from "../../../dev/miniflare";
import { getAssetPaths, getSiteAssetPaths } from "../../../sites";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import { getServiceBindings } from "./services";
import type { Config } from "../../../config";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type { MiniflareOptions, ModuleRule, WorkerOptions } from "miniflare";

/**
 * Options for the `getPlatformProxy` utility
 */
export type GetPlatformProxyOptions = {
	/**
	 * The name of the environment to use
	 */
	environment?: string;
	/**
	 * The path to the config object to use (default `wrangler.toml`)
	 */
	configPath?: string;
	/**
	 * Flag to indicate the utility to read a json config file (`wrangler.json`)
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
	const env = options.environment;

	const rawConfig = readConfig(options.configPath, {
		experimentalJsonConfig: options.experimentalJsonConfig,
		env,
	});

	const miniflareOptions = await getMiniflareOptionsFromConfig(
		rawConfig,
		env,
		options
	);

	const mf = new Miniflare({
		script: "",
		modules: true,
		...(miniflareOptions as Record<string, unknown>),
	});

	const bindings: Env = await mf.getBindings();

	const vars = getVarsForDev(rawConfig, env);

	const cf = await mf.getCf();
	deepFreeze(cf);

	return {
		env: {
			...vars,
			...bindings,
		},
		cf: cf as CfProperties,
		ctx: new ExecutionContext(),
		caches: new CacheStorage(),
		dispose: () => mf.dispose(),
	};
}

async function getMiniflareOptionsFromConfig(
	rawConfig: Config,
	env: string | undefined,
	options: GetPlatformProxyOptions
): Promise<Partial<MiniflareOptions>> {
	const bindings = getBindings(rawConfig, env, true, {});

	const workerDefinitions = await getBoundRegisteredWorkers({
		name: rawConfig.name,
		services: bindings.services,
		durableObjects: rawConfig["durable_objects"],
	});

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions({
		name: undefined,
		bindings,
		workerDefinitions,
		queueConsumers: undefined,
		services: rawConfig.services,
		serviceBindings: {},
	});

	const persistOptions = getMiniflarePersistOptions(options.persist);

	const serviceBindings = await getServiceBindings(bindings.services);

	const miniflareOptions: MiniflareOptions = {
		workers: [
			{
				script: "",
				modules: true,
				...bindingOptions,
				serviceBindings: {
					...serviceBindings,
					...bindingOptions.serviceBindings,
				},
			},
			...externalWorkers,
		],
		...persistOptions,
	};

	return miniflareOptions;
}

/**
 * Get the persist option properties to pass to miniflare
 *
 * @param persist The user provided persistence option
 * @returns an object containing the properties to pass to miniflare
 */
function getMiniflarePersistOptions(
	persist: GetPlatformProxyOptions["persist"]
): Pick<
	MiniflareOptions,
	"kvPersist" | "durableObjectsPersist" | "r2Persist" | "d1Persist"
> {
	if (persist === false) {
		// the user explicitly asked for no persistance
		return {
			kvPersist: false,
			durableObjectsPersist: false,
			r2Persist: false,
			d1Persist: false,
		};
	}

	const defaultPersistPath = ".wrangler/state/v3";

	const persistPath =
		typeof persist === "object" ? persist.path : defaultPersistPath;

	return {
		kvPersist: `${persistPath}/kv`,
		durableObjectsPersist: `${persistPath}/do`,
		r2Persist: `${persistPath}/r2`,
		d1Persist: `${persistPath}/d1`,
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
	environment?: string
): {
	workerOptions: SourcelessWorkerOptions;
	define: Record<string, string>;
	main?: string;
} {
	const config = readConfig(configPath, {
		experimentalJsonConfig: true,
		env: environment,
	});

	const modulesRules: ModuleRule[] = config.rules
		.concat(DEFAULT_MODULE_RULES)
		.map((rule) => ({
			type: rule.type,
			include: rule.globs,
			fallthrough: rule.fallthrough,
		}));

	const env = undefined;
	const bindings = getBindings(config, env, true, {});
	const { bindingOptions } = buildMiniflareBindingOptions({
		name: undefined,
		bindings,
		workerDefinitions: undefined,
		queueConsumers: config.queues.consumers,
		services: [],
		serviceBindings: {},
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
				return [binding.binding, binding.service];
			})
		);
	}
	if (bindings.durable_objects !== undefined) {
		bindingOptions.durableObjects = Object.fromEntries(
			bindings.durable_objects.bindings.map((binding) => [
				binding.name,
				{ className: binding.class_name, scriptName: binding.script_name },
			])
		);
	}

	const assetPaths = config.assets
		? getAssetPaths(config, undefined)
		: getSiteAssetPaths(config);
	const sitesOptions = buildSitesOptions({ assetPaths });

	const workerOptions: SourcelessWorkerOptions = {
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		modulesRules,

		...bindingOptions,
		...sitesOptions,
	};

	return { workerOptions, define: config.define, main: config.main };
}
