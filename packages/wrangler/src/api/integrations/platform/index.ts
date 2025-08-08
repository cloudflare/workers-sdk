import { resolveDockerHost } from "@cloudflare/containers-shared";
import { kCurrentWorker, Miniflare } from "miniflare";
import { getAssetsOptions, NonExistentAssetsDirError } from "../../../assets";
import { readConfig } from "../../../config";
import { partitionDurableObjectBindings } from "../../../deployment-bundle/entry";
import { DEFAULT_MODULE_RULES } from "../../../deployment-bundle/rules";
import { getBindings } from "../../../dev";
import { getClassNamesWhichUseSQLite } from "../../../dev/class-names-sqlite";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	buildSitesOptions,
	getImageNameFromDOClassName,
} from "../../../dev/miniflare";
import {
	getDockerPath,
	getRegistryPath,
} from "../../../environment-variables/misc-variables";
import { logger } from "../../../logger";
import { getSiteAssetPaths } from "../../../sites";
import { dedent } from "../../../utils/dedent";
import { maybeStartOrUpdateRemoteProxySession } from "../../remoteBindings";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import type { AssetsOptions } from "../../../assets";
import type { Config, RawConfig, RawEnvironment } from "../../../config";
import type { RemoteProxySession } from "../../remoteBindings";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type {
	MiniflareOptions,
	ModuleRule,
	RemoteProxyConnectionString,
	WorkerOptions,
} from "miniflare";

export { getVarsForDev as unstable_getVarsForDev } from "../../../dev/dev-vars";
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
	 * Paths to `.env` files to load environment variables from, relative to the project directory.
	 *
	 * The project directory is computed as the directory containing `configPath` or the current working directory if `configPath` is undefined.
	 *
	 * If `envFiles` is defined, only the files in the array will be considered for loading local dev variables.
	 * If `undefined`, the default behavior is:
	 *  - compute the project directory as that containing the Wrangler configuration file,
	 *    or the current working directory if no Wrangler configuration file is specified.
	 *  - look for `.env` and `.env.local` files in the project directory.
	 *  - if the `environment` option is specified, also look for `.env.<environment>` and `.env.<environment>.local`
	 *    files in the project directory
	 *  - resulting in an `envFiles` array like: `[".env", ".env.local", ".env.<environment>", ".env.<environment>.local"]`.
	 *
	 * The values from files earlier in the `envFiles` array (e.g. `envFiles[x]`) will be overridden by values from files later in the array (e.g. `envFiles[x+1)`).
	 */
	envFiles?: string[];
	/**
	 * Indicates if and where to persist the bindings data, if not present or `true` it defaults to the same location
	 * used by wrangler: `.wrangler/state/v3` (so that the same data can be easily used by the caller and wrangler).
	 * If `false` is specified no data is persisted on the filesystem.
	 */
	persist?: boolean | { path: string };
	/**
	 * Experimental flags (note: these can change at any time and are not version-controlled use at your own risk)
	 */
	experimental?: {
		/** whether access to remove bindings should be enabled */
		remoteBindings?: boolean;
	};
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
	const experimentalRemoteBindings = !!options.experimental?.remoteBindings;

	const env = options.environment;

	const config = readConfig({
		config: options.configPath,
		env,
	});

	let remoteProxySession: RemoteProxySession | undefined = undefined;
	if (experimentalRemoteBindings && config.configPath) {
		remoteProxySession = (
			(await maybeStartOrUpdateRemoteProxySession({
				path: config.configPath,
				environment: env,
			})) ?? {}
		).session;
	}

	const miniflareOptions = await getMiniflareOptionsFromConfig({
		config,
		options,
		remoteProxyConnectionString:
			remoteProxySession?.remoteProxyConnectionString,
		remoteBindingsEnabled: experimentalRemoteBindings,
	});

	const mf = new Miniflare(miniflareOptions);

	const bindings: Env = await mf.getBindings();

	const cf = await mf.getCf();
	deepFreeze(cf);

	return {
		env: bindings,
		cf: cf as CfProperties,
		ctx: new ExecutionContext(),
		caches: new CacheStorage(),
		dispose: async () => {
			await remoteProxySession?.dispose();
			await mf.dispose();
		},
	};
}

/**
 * Builds an options configuration object for the `getPlatformProxy` functionality that
 * can be then passed to the Miniflare constructor
 *
 * @param args.config The wrangler configuration to base the options from
 * @param args.options The user provided `getPlatformProxy` options
 * @param args.remoteProxyConnectionString The potential remote proxy connection string to be used to connect the remote bindings
 * @param args.remoteBindingsEnabled Whether remote bindings are enabled
 * @returns an object ready to be passed to the Miniflare constructor
 */
async function getMiniflareOptionsFromConfig(args: {
	config: Config;
	options: GetPlatformProxyOptions;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
	remoteBindingsEnabled: boolean;
}): Promise<MiniflareOptions> {
	const {
		config,
		options,
		remoteProxyConnectionString,
		remoteBindingsEnabled,
	} = args;

	const bindings = getBindings(
		config,
		options.environment,
		options.envFiles,
		true,
		{},
		remoteBindingsEnabled
	);

	if (config["durable_objects"]) {
		const { localBindings } = partitionDurableObjectBindings(config);
		if (localBindings.length > 0) {
			logger.warn(dedent`
				You have defined bindings to the following internal Durable Objects:
				${localBindings.map((b) => `- ${JSON.stringify(b)}`).join("\n")}
				These will not work in local development, but they should work in production.

				If you want to develop these locally, you can define your DO in a separate Worker, with a separate configuration file.
				For detailed instructions, refer to the Durable Objects section here: https://developers.cloudflare.com/workers/wrangler/api#supported-bindings
				`);
		}
	}

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		{
			name: config.name,
			complianceRegion: config.compliance_region,
			bindings,
			queueConsumers: undefined,
			services: bindings.services,
			serviceBindings: {},
			migrations: config.migrations,
			imagesLocalMode: true,
			tails: [],
			containerDOClassNames: new Set(
				config.containers?.map((c) => c.class_name)
			),
			containerBuildId: undefined,
			enableContainers: config.dev.enable_containers,
		},
		remoteProxyConnectionString,
		remoteBindingsEnabled
	);

	let processedAssetOptions: AssetsOptions | undefined;

	try {
		processedAssetOptions = getAssetsOptions({ assets: undefined }, config);
	} catch (e) {
		const isNonExistentError = e instanceof NonExistentAssetsDirError;
		// we want to loosen up the assets directory existence restriction here,
		// since `getPlatformProxy` can be run when the assets directory doesn't actual
		// exist, but all other exceptions should still be thrown
		if (!isNonExistentError) {
			throw e;
		}
	}

	const assetOptions = processedAssetOptions
		? buildAssetOptions({ assets: processedAssetOptions })
		: {};

	const defaultPersistRoot = getMiniflarePersistRoot(options.persist);

	const miniflareOptions: MiniflareOptions = {
		workers: [
			{
				script: "",
				modules: true,
				name: config.name,
				...bindingOptions,
				...assetOptions,
			},
			...externalWorkers,
		],
		defaultPersistRoot,
	};

	return {
		script: "",
		modules: true,
		...miniflareOptions,
		unsafeDevRegistryPath: getRegistryPath(),
		unsafeDevRegistryDurableObjectProxy: true,
	};
}

/**
 * Get the persist option properties to pass to miniflare
 *
 * @param persist The user provided persistence option
 * @returns an object containing the properties to pass to miniflare
 */
function getMiniflarePersistRoot(
	persist: GetPlatformProxyOptions["persist"]
): string | undefined {
	if (persist === false) {
		// the user explicitly asked for no persistance
		return;
	}

	const defaultPersistPath = ".wrangler/state/v3";
	const persistPath =
		typeof persist === "object" ? persist.path : defaultPersistPath;

	return persistPath;
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
	externalWorkers: WorkerOptions[];
}

export function unstable_getMiniflareWorkerOptions(
	configPath: string,
	env?: string,
	options?: {
		imagesLocalMode?: boolean;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		remoteBindingsEnabled?: boolean;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): Unstable_MiniflareWorkerOptions;
export function unstable_getMiniflareWorkerOptions(
	config: Config,
	env?: string,
	options?: {
		imagesLocalMode?: boolean;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		remoteBindingsEnabled?: boolean;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): Unstable_MiniflareWorkerOptions;
export function unstable_getMiniflareWorkerOptions(
	configOrConfigPath: string | Config,
	env?: string,
	options?: {
		envFiles?: string[];
		imagesLocalMode?: boolean;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		remoteBindingsEnabled?: boolean;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
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

	const containerDOClassNames = new Set(
		config.containers?.map((c) => c.class_name)
	);
	const bindings = getBindings(config, env, options?.envFiles, true, {}, true);

	const enableContainers =
		options?.overrides?.enableContainers !== undefined
			? options?.overrides?.enableContainers
			: config.dev.enable_containers;

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		{
			name: config.name,
			complianceRegion: config.compliance_region,
			bindings,
			queueConsumers: config.queues.consumers,
			services: [],
			serviceBindings: {},
			migrations: config.migrations,
			imagesLocalMode: !!options?.imagesLocalMode,
			tails: config.tail_consumers,
			containerDOClassNames,
			containerBuildId: options?.containerBuildId,
			enableContainers,
		},
		options?.remoteProxyConnectionString,
		options?.remoteBindingsEnabled ?? false
	);

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
				if (
					options?.remoteProxyConnectionString &&
					binding.experimental_remote
				) {
					return [
						binding.binding,
						{
							name,
							entrypoint: binding.entrypoint,
							remoteProxyConnectionString: options.remoteProxyConnectionString,
						},
					];
				}
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
						container:
							enableContainers && config.containers?.length
								? getImageNameFromDOClassName({
										doClassName: binding.class_name,
										containerDOClassNames,
										containerBuildId: options?.containerBuildId,
									})
								: undefined,
					} satisfies DurableObjectDefinition,
				];
			})
		);
	}

	const sitesAssetPaths = getSiteAssetPaths(config);
	const sitesOptions = buildSitesOptions({ legacyAssetPaths: sitesAssetPaths });
	const processedAssetOptions = getAssetsOptions(
		{ assets: undefined },
		config,
		options?.overrides?.assets
	);
	const assetOptions = processedAssetOptions
		? buildAssetOptions({ assets: processedAssetOptions })
		: {};

	const useContainers =
		config.dev?.enable_containers && config.containers?.length;
	const workerOptions: SourcelessWorkerOptions = {
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		modulesRules,
		containerEngine: useContainers
			? config.dev.container_engine ?? resolveDockerHost(getDockerPath())
			: undefined,

		...bindingOptions,
		...sitesOptions,
		...assetOptions,
	};

	return {
		workerOptions,
		define: config.define,
		main: config.main,
		externalWorkers,
	};
}
