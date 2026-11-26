import path from "node:path";
import {
	DEFAULT_COMPAT_DATE,
	getRegistryPath,
} from "@cloudflare/workers-utils";
import {
	createArtifactsLocalDefaultWarner,
	extractBindingsOfType,
} from "@cloudflare/workers-utils/config";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getAssetsOptions } from "../../../assets";
import { readConfig } from "../../../config";
import { partitionDurableObjectBindings } from "../../../deployment-bundle/entry";
import { getBindings } from "../../../dev";
import { getDurableObjectClassNameToUseSQLiteMap } from "../../../dev/class-names-sqlite";
import { getVarsForDev } from "../../../dev/dev-vars";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	getDefaultProjectTmpPath,
} from "../../../dev/miniflare";
import {
	getMiniflareWorkerOptions,
	getZoneFromConfig,
} from "../../../dev/miniflare-options";
import { logger } from "../../../logger";
import { dedent } from "../../../utils/dedent";
import { maybeStartOrUpdateRemoteProxySession } from "../../remoteBindings";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./executionContext";
import type { RemoteProxySession } from "../../remoteBindings";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type { AssetsOptions, Binding } from "@cloudflare/workers-utils";
import type {
	Config,
	RawConfig,
	RawEnvironment,
} from "@cloudflare/workers-utils/config";
import type {
	RemoteProxyConnectionString,
	V4MiniflareOptions,
	V4ModuleRule,
	V4WorkerOptions,
} from "miniflare";

/**
 * Resolve local variable bindings from a Wrangler config and development env files.
 *
 * This wrapper keeps the bundled helper out of Wrangler's published type imports.
 */
export function unstable_getVarsForDev(
	configPath: string | undefined,
	envFiles: string[] | undefined,
	vars: Config["vars"],
	env: string | undefined,
	silent = false,
	secrets?: Config["secrets"]
): Record<
	string,
	Extract<Binding, { type: "plain_text" | "json" | "secret_text" }>
> {
	return getVarsForDev(configPath, envFiles, vars, env, silent, secrets);
}
export { readConfig as unstable_readConfig };
export { getDurableObjectClassNameToUseSQLiteMap as unstable_getDurableObjectClassNameToUseSQLiteMap };

/**
 * @deprecated Set a compatibility date explicitly instead.
 */
export function unstable_getDevCompatibilityDate() {
	return DEFAULT_COMPAT_DATE;
}

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
	 * Whether remote bindings should be enabled or not (defaults to `true`).
	 * When enabled and configured, the remote session connects before this function
	 * returns because a binding call can block the Node.js thread needed to connect.
	 */
	remoteBindings?: boolean;
};

// Remembers warnings per config file, so a framework that calls
// `getPlatformProxy()` again after a config change doesn't repeat them.
const warnForArtifactsLocalDefault =
	createArtifactsLocalDefaultWarner("wrangler");

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

	const config = readConfig({
		config: options.configPath,
		env,
	});

	if (options.remoteBindings !== false) {
		warnForArtifactsLocalDefault(
			{
				// A relative path names a different file after a directory change.
				id: config.configPath ? path.resolve(config.configPath) : process.cwd(),
				bindings: config.artifacts.map(({ binding, remote }) => ({
					name: binding,
					remote,
				})),
			},
			(message) => logger.warn(message)
		);
	}

	let remoteProxySession: RemoteProxySession | undefined = undefined;
	if (config.configPath && options.remoteBindings !== false) {
		const sessionData = await maybeStartOrUpdateRemoteProxySession(
			{ path: config.configPath, environment: env },
			undefined,
			undefined,
			true
		);
		remoteProxySession = sessionData?.session;
	}

	const miniflareOptions = await getMiniflareOptionsFromConfig({
		config,
		options,
		remoteProxyConnectionString:
			remoteProxySession?.remoteProxyConnectionString,
	});

	const mf = new Miniflare(convertV4MiniflareOptions(miniflareOptions));

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
}): Promise<V4MiniflareOptions> {
	const { config, options, remoteProxyConnectionString } = args;

	const bindings = getBindings(
		config,
		options.environment,
		options.envFiles,
		true,
		{},
		{}
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

	if (config.workflows?.length > 0) {
		// Workflow bindings without a `script_name` aren't routable in
		// `getPlatformProxy()` — the engine inside this Miniflare instance has
		// nowhere to dispatch USER_WORKFLOW. Strip those (and warn).
		// Cross-worker workflows (with `script_name` referring to another worker
		// registered in the dev registry) are passed through; Miniflare's
		// workflows plugin reroutes them via the dev-registry-proxy.
		const localWorkflows = config.workflows.filter((w) => !w.script_name);
		if (localWorkflows.length > 0) {
			logger.warn(dedent`
				You have defined bindings to the following Workflows without a script_name:
				${localWorkflows.map((b) => `- ${JSON.stringify(b)}`).join("\n")}
				These are not available in local development, so you will not be able to bind to them when testing locally, but they should work in production.
				`);

			// Remove only the local workflows from bindings.
			const allWorkflowBindings = extractBindingsOfType("workflow", bindings);
			const localBindingNames = new Set(localWorkflows.map((w) => w.binding));
			for (const wf of allWorkflowBindings) {
				if (localBindingNames.has(wf.binding)) {
					delete bindings?.[wf.binding];
				}
			}
		}
	}

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		{
			name: config.name,
			complianceRegion: config.compliance_region,
			bindings,
			queueConsumers: undefined,
			migrations: config.migrations,
			// The platform proxy doesn't run the Worker's code, so it can't run the
			// Workflows the Worker exports.
			exports:
				config.exports &&
				Object.fromEntries(
					Object.entries(config.exports).filter(
						([, exported]) => exported.type !== "workflow"
					)
				),
			tails: [],
			streamingTails: [],
			// Platform proxy does not prepare local Container images.
			enableContainers: false,
		},
		remoteProxyConnectionString
	);

	let processedAssetOptions: AssetsOptions | undefined;

	// Only resolve assets if a directory is configured. When assets are configured
	// without a directory (e.g. via @cloudflare/vite-plugin), skip asset setup.
	if (config.assets?.directory) {
		processedAssetOptions = getAssetsOptions({
			args: {
				assets: undefined,
			},
			config,
			// For getPlatformProxy/local dev we don't need to validate the directory's existence
			validateDirectoryExistence: false,
		});
	}

	const assetOptions = processedAssetOptions
		? buildAssetOptions({ assets: processedAssetOptions })
		: {};

	const resourcePersistencePath = getMiniflarePersistRoot(options.persist);
	const projectRoot = config.userConfigPath
		? path.dirname(config.userConfigPath)
		: process.cwd();
	const resourceTmpPath = getDefaultProjectTmpPath(projectRoot);

	const miniflareOptions: V4MiniflareOptions = {
		rootPath: projectRoot,
		workers: [
			{
				script:
					// Asset misses still route to this placeholder Worker, so terminate them instead of letting workerd's default handler forward back to this instance.
					"export default { fetch() { return new Response(null, { status: 404 }); } };",
				modules: true,
				name: config.name,
				zone: getZoneFromConfig(config),
				...bindingOptions,
				...assetOptions,
			},
			...externalWorkers,
		],
		resourcePersistencePath,
		resourceTmpPath,
	};

	return {
		script: "",
		modules: true,
		...miniflareOptions,
		unsafeDevRegistryPath: getRegistryPath(),
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
	V4WorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
> & { modulesRules?: V4ModuleRule[] };

export interface Unstable_MiniflareWorkerOptions {
	workerOptions: SourcelessWorkerOptions;
	define: Record<string, string>;
	main?: string;
	externalWorkers: V4WorkerOptions[];
}

export function unstable_getMiniflareWorkerOptions(
	configPath: string,
	env?: string,
	options?: {
		remoteProxyConnectionString?: RemoteProxyConnectionString;
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
		remoteProxyConnectionString?: RemoteProxyConnectionString;
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
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): Unstable_MiniflareWorkerOptions {
	return getMiniflareWorkerOptions(
		typeof configOrConfigPath === "string"
			? readConfig({ config: configOrConfigPath, env })
			: configOrConfigPath,
		env,
		options
	);
}
