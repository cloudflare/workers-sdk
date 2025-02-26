import assert from "node:assert";
import path from "node:path";
import { kCurrentWorker, Miniflare } from "miniflare";
import { getAssetsOptions } from "../../../assets";
import { readConfig } from "../../../config";
import { bundleWorker } from "../../../deployment-bundle/bundle";
import { getEntry } from "../../../deployment-bundle/entry";
import { createModuleCollector } from "../../../deployment-bundle/module-collection";
import { validateNodeCompatMode } from "../../../deployment-bundle/node-compat";
import { DEFAULT_MODULE_RULES } from "../../../deployment-bundle/rules";
import { getBindings } from "../../../dev";
import { getBoundRegisteredWorkers } from "../../../dev-registry";
import { getClassNamesWhichUseSQLite } from "../../../dev/class-names-sqlite";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	buildSitesOptions,
} from "../../../dev/miniflare";
import { run } from "../../../experimental-flags";
import { getWranglerTmpDir } from "../../../paths";
import { getLegacyAssetPaths, getSiteAssetPaths } from "../../../sites";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import { getServiceBindings } from "./services";
import type { Config, RawConfig, RawEnvironment } from "../../../config";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type { MiniflareOptions, ModuleRule, WorkerOptions } from "miniflare";

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
	 */
	exportsPath?: string;
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
export async function getPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
>(
	options: GetPlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	const env = options.environment;

	const rawConfig = readConfig({
		config: options.configPath,
		env,
	});

	const miniflareOptions = await run(
		{
			MULTIWORKER: false,
			RESOURCES_PROVISION: false,
		},
		() => getMiniflareOptionsFromConfig(rawConfig, env, options)
	);

	const mf = new Miniflare({
		script: "",
		modules: true,
		...(miniflareOptions as Record<string, unknown>),
	});

	const bindings: Env = await mf.getBindings();

	const cf = await mf.getCf();
	deepFreeze(cf);

	return {
		env: bindings,
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
		name: rawConfig.name,
		bindings,
		workerDefinitions,
		queueConsumers: undefined,
		services: rawConfig.services,
		serviceBindings: {},
		migrations: rawConfig.migrations,
		imagesLocalMode: false,
	});

	// make frameworks specify the fallback explicitly?
	const main = options.exportsPath ?? rawConfig.main;
	assert(main);
	const persistOptions = getMiniflarePersistOptions(options.persist);

	const serviceBindings = await getServiceBindings(bindings.services);

	assert(rawConfig.configPath);
	const projectRoot = path.dirname(rawConfig.configPath);
	const tmpDir = getWranglerTmpDir(
		path.dirname(rawConfig.configPath),
		"get-platform-proxy"
	);

	const entry = await getEntry({}, rawConfig, "dev");
	const moduleCollector = createModuleCollector({
		entry,
		findAdditionalModules: false,
		rules: [],
	});
	const nodejsCompatMode = validateNodeCompatMode(
		rawConfig.compatibility_date,
		rawConfig.compatibility_flags,
		{ nodeCompat: false, noBundle: false }
	);
	const bundle = await bundleWorker(entry, tmpDir.path, {
		bundle: true,
		moduleCollector,
		additionalModules: [],
		serveLegacyAssetsFromWorker: false,
		jsxFactory: undefined,
		jsxFragment: undefined,
		watch: false,
		tsconfig: undefined,
		minify: false,
		nodejsCompatMode,
		// think this is just for a warning?
		doBindings: [],
		// think this is just for a warning?
		workflowBindings: [],
		alias: {},
		define: {},
		mockAnalyticsEngineDatasets: [],
		legacyAssets: undefined,
		// disable the cache in dev
		bypassAssetCache: true,
		targetConsumer: "dev",
		testScheduled: false,
		plugins: [],
		local: true,
		projectRoot,
		defineNavigatorUserAgent: true,

		// Pages specific options used by wrangler pages commands
		entryName: undefined,
		inject: undefined,
		isOutfile: undefined,
		external: undefined,

		// sourcemap defaults to true in dev
		sourcemap: undefined,
		checkFetch: false,
	});

	const miniflareOptions: MiniflareOptions = {
		workers: [
			{
				name: rawConfig.name,
				scriptPath: bundle.resolvedEntryPointPath,
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
	| "kvPersist"
	| "durableObjectsPersist"
	| "r2Persist"
	| "d1Persist"
	| "workflowsPersist"
> {
	if (persist === false) {
		// the user explicitly asked for no persistance
		return {
			kvPersist: false,
			durableObjectsPersist: false,
			r2Persist: false,
			d1Persist: false,
			workflowsPersist: false,
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
		workflowsPersist: `${persistPath}/workflows`,
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
