import * as fs from "node:fs";
import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import { defu } from "defu";
import * as vite from "vite";
import * as wrangler from "wrangler";
import { DEFAULT_COMPAT_DATE } from "./build-constants";
import { getWorkerConfigs } from "./deploy-config";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import {
	getValidatedWranglerConfigPath,
	readWorkerConfigFromFile,
	readWorkerConfigFromRaw,
	resolveWorkerType,
} from "./workers-configs";
import type { Defined } from "./utils";
import type {
	AssetsOnlyWorkerResolvedConfig,
	NonApplicableConfigMap,
	WorkerConfig,
	WorkerResolvedConfig,
	WorkerWithServerLogicResolvedConfig,
} from "./workers-configs";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { RawConfig } from "@cloudflare/workers-utils";
import type { Unstable_Config } from "wrangler";

export type PersistState = boolean | { path: string };
export type TunnelConfig = {
	autoStart?: boolean;
	name?: string;
};

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string; childEnvironments?: string[] };
}

/**
 * Whether this Worker is only used during development and should not be built for production.
 * Can be a boolean or a function that returns a boolean. The function is evaluated lazily
 * at build time, allowing frameworks to provide the value after initialization.
 */
type DevOnly = boolean | (() => boolean);

interface EntryWorkerConfig extends BaseWorkerConfig {
	configPath?: string;
	config?: WorkerConfigCustomizer<true>;
	/**
	 * Whether the entry Worker should be omitted from the production build.
	 * Can be a boolean or a function that returns a boolean. The function is
	 * evaluated lazily at build time, allowing frameworks to provide the value
	 * after initialization.
	 *
	 * When set, an assets-only Wrangler config is emitted to the client output
	 * directory. This enables using server-side code in development but producing
	 * a fully static app for deployment.
	 */
	assetsOnly?: DevOnly;
}

interface AuxiliaryWorkerFileConfig extends BaseWorkerConfig {
	configPath: string;
	devOnly?: DevOnly;
}

interface AuxiliaryWorkerInlineConfig extends BaseWorkerConfig {
	configPath?: string;
	config: WorkerConfigCustomizer<false>;
	devOnly?: DevOnly;
}

type AuxiliaryWorkerConfig =
	| AuxiliaryWorkerFileConfig
	| AuxiliaryWorkerInlineConfig;

interface PrerenderWorkerFileConfig extends BaseWorkerConfig {
	configPath: string;
}

interface PrerenderWorkerInlineConfig extends BaseWorkerConfig {
	configPath?: string;
	config: WorkerConfigCustomizer<false>;
}

type PrerenderWorkerConfig =
	| PrerenderWorkerFileConfig
	| PrerenderWorkerInlineConfig;

interface ExperimentalNewConfig {
	/** Options for type generation. */
	types?: {
		/**
		 * Whether to auto-generate `worker-configuration.d.ts` at the project
		 * root. Defaults to `true`.
		 */
		generate?: boolean;
	};
}

interface ResolvedExperimentalNewConfig {
	types: { generate: boolean };
}

interface Experimental {
	/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
	headersAndRedirectsDevModeSupport?: boolean;
	/** Experimental support for a dedicated prerender Worker */
	prerenderWorker?: PrerenderWorkerConfig;
	/**
	 * Experimental support for loading the entry Worker's configuration from
	 * `cloudflare.config.ts` instead of `wrangler.json` /
	 * `wrangler.jsonc` / `wrangler.toml`.
	 *
	 * Pass `true` for defaults, or an object to customize behaviour.
	 */
	newConfig?: boolean | ExperimentalNewConfig;
}

function normalizeNewConfig(
	option: boolean | ExperimentalNewConfig | undefined
): ResolvedExperimentalNewConfig | undefined {
	if (option === undefined || option === false) {
		return undefined;
	}
	if (option === true) {
		return { types: { generate: true } };
	}
	return { types: { generate: option.types?.generate ?? true } };
}

type FilteredEntryWorkerConfig = Omit<
	ResolvedAssetsOnlyConfig,
	"topLevelName" | "name"
>;

type WorkerConfigCustomizer<TIsEntryWorker extends boolean> =
	| Partial<WorkerConfig>
	| ((
			...args: TIsEntryWorker extends true
				? [config: WorkerConfig]
				: [
						config: WorkerConfig,
						{ entryWorkerConfig: FilteredEntryWorkerConfig },
					]
	  ) => Partial<WorkerConfig> | void);

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
	inspectorPort?: number | false;
	remoteBindings?: boolean;
	tunnel?: boolean | TunnelConfig;
	experimental?: Experimental;
}

export interface ResolvedAssetsOnlyConfig extends WorkerConfig {
	topLevelName: Defined<WorkerConfig["topLevelName"]>;
	name: Defined<WorkerConfig["name"]>;
	compatibility_date: Defined<WorkerConfig["compatibility_date"]>;
}

export interface ResolvedWorkerConfig extends ResolvedAssetsOnlyConfig {
	main: Defined<WorkerConfig["main"]>;
}

export interface Worker {
	config: ResolvedWorkerConfig;
	nodeJsCompat: NodeJsCompat | undefined;
	devOnly: DevOnly | undefined;
}

interface BaseResolvedConfig {
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	experimental: Pick<Experimental, "headersAndRedirectsDevModeSupport"> & {
		newConfig?: ResolvedExperimentalNewConfig;
	};
	remoteBindings: boolean;
	tunnel: TunnelConfig;
}

interface NonPreviewResolvedConfig extends BaseResolvedConfig {
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
	prerenderWorkerEnvironmentName: string | undefined;
}

export interface AssetsOnlyResolvedConfig extends NonPreviewResolvedConfig {
	type: "assets-only";
	config: ResolvedAssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

export interface WorkersResolvedConfig extends NonPreviewResolvedConfig {
	type: "workers";
	entryWorkerEnvironmentName: string;
	staticRouting: StaticRouting | undefined;
	rawConfigs: {
		entryWorker: WorkerWithServerLogicResolvedConfig;
		auxiliaryWorkers: WorkerResolvedConfig[];
	};
}

export interface PreviewResolvedConfig extends BaseResolvedConfig {
	type: "preview";
	workers: Unstable_Config[];
}

export type ResolvedPluginConfig =
	| AssetsOnlyResolvedConfig
	| WorkersResolvedConfig
	| PreviewResolvedConfig;

function filterEntryWorkerConfig(
	config: ResolvedAssetsOnlyConfig
): FilteredEntryWorkerConfig {
	const {
		topLevelName: _topLevelName,
		name: _name,
		...filteredConfig
	} = config;

	return filteredConfig;
}

export function customizeWorkerConfig(options: {
	workerConfig: WorkerConfig;
	configCustomizer: WorkerConfigCustomizer<false> | undefined;
	entryWorkerConfig: ResolvedAssetsOnlyConfig;
}): WorkerConfig;
export function customizeWorkerConfig(options: {
	workerConfig: WorkerConfig;
	configCustomizer: WorkerConfigCustomizer<true> | undefined;
}): WorkerConfig;
export function customizeWorkerConfig(
	options:
		| {
				workerConfig: WorkerConfig;
				configCustomizer: WorkerConfigCustomizer<false> | undefined;
				entryWorkerConfig: ResolvedAssetsOnlyConfig;
		  }
		| {
				workerConfig: WorkerConfig;
				configCustomizer: WorkerConfigCustomizer<true> | undefined;
		  }
): WorkerConfig {
	// The `config` option can either be an object to merge into the worker config,
	// a function that returns such an object, or a function that mutates the worker config in place.
	const configResult =
		typeof options.configCustomizer === "function"
			? "entryWorkerConfig" in options
				? options.configCustomizer(options.workerConfig, {
						entryWorkerConfig: filterEntryWorkerConfig(
							options.entryWorkerConfig
						),
					})
				: options.configCustomizer(options.workerConfig)
			: options.configCustomizer;

	// If the configResult is defined, merge it into the existing config.
	if (configResult) {
		return defu(configResult, options.workerConfig) as WorkerConfig;
	}

	return options.workerConfig;
}

/**
 * Resolves the config for a single worker, applying defaults, file config, and config().
 */
function resolveWorkerConfig(
	options: {
		root: string;
		configPath: string | undefined;
		env: string | undefined;
		visitedConfigPaths: Set<string>;
		/**
		 * When provided, skip reading from `configPath` and instead normalize
		 * this in-memory `RawConfig` (produced e.g. by `convertToWranglerConfig`
		 * from `@cloudflare/config`).
		 */
		rawConfigOverride?: RawConfig;
	} & (
		| {
				configCustomizer: WorkerConfigCustomizer<false> | undefined;
				entryWorkerConfig: ResolvedAssetsOnlyConfig;
		  }
		| { configCustomizer: WorkerConfigCustomizer<true> | undefined }
	)
): WorkerResolvedConfig {
	const isEntryWorker = !("entryWorkerConfig" in options);
	let workerConfig: WorkerConfig;
	let raw: Unstable_Config;
	let nonApplicable: NonApplicableConfigMap;

	if (options.rawConfigOverride) {
		({
			raw,
			config: workerConfig,
			nonApplicable,
		} = readWorkerConfigFromRaw(options.rawConfigOverride));
	} else if (options.configPath) {
		// File config already has defaults applied
		({
			raw,
			config: workerConfig,
			nonApplicable,
		} = readWorkerConfigFromFile(options.configPath, options.env, {
			visitedConfigPaths: options.visitedConfigPaths,
		}));
	} else {
		// No file: start with defaults
		workerConfig = { ...wrangler.unstable_defaultWranglerConfig };
		raw = structuredClone(workerConfig);
		nonApplicable = {
			replacedByVite: new Set(),
			notRelevant: new Set(),
			notSupportedOnAuxiliary: new Set(),
		};
	}

	// Apply config()
	workerConfig =
		"entryWorkerConfig" in options
			? customizeWorkerConfig({
					workerConfig,
					configCustomizer: options.configCustomizer,
					entryWorkerConfig: options.entryWorkerConfig,
				})
			: customizeWorkerConfig({
					workerConfig,
					configCustomizer: options.configCustomizer,
				});

	workerConfig.compatibility_date ??= DEFAULT_COMPAT_DATE;

	if (isEntryWorker) {
		workerConfig.name ??= wrangler.unstable_getWorkerNameFromProject(
			options.root
		);
	}
	// Auto-populate topLevelName from name
	workerConfig.topLevelName ??= workerConfig.name;

	return resolveWorkerType(workerConfig, raw, nonApplicable, {
		isEntryWorker,
		configPath: options.configPath,
		root: options.root,
		env: options.env,
	});
}

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): Promise<ResolvedPluginConfig> {
	const resolvedNewConfig = normalizeNewConfig(
		pluginConfig.experimental?.newConfig
	);
	const shared = {
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
		tunnel:
			typeof pluginConfig.tunnel === "boolean"
				? { autoStart: pluginConfig.tunnel }
				: {
						autoStart: pluginConfig.tunnel?.autoStart ?? false,
						name: pluginConfig.tunnel?.name,
					},
		experimental: {
			headersAndRedirectsDevModeSupport:
				pluginConfig.experimental?.headersAndRedirectsDevModeSupport,
			newConfig: resolvedNewConfig,
		},
	};
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const prefixedEnv = vite.loadEnv(viteEnv.mode, root, [
		"CLOUDFLARE_",
		// TODO: Remove deprecated WRANGLER prefix support in next major version
		"WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_",
	]);

	// Merge the loaded env variables into process.env so that they are available to
	// wrangler when it loads the worker configuration files.
	Object.assign(process.env, prefixedEnv);

	// The `cf-vite` delegate binary's `--local` flag sets this env var to
	// force remote bindings off, overriding any `remoteBindings` value in the
	// plugin config (mirrors `wrangler dev --local`).
	const remoteBindings =
		prefixedEnv.CLOUDFLARE_VITE_FORCE_LOCAL === "true"
			? false
			: (pluginConfig.remoteBindings ?? true);

	if (viteEnv.isPreview) {
		return {
			...shared,
			remoteBindings,
			type: "preview",
			workers: getWorkerConfigs(root, !!process.env.CLOUDFLARE_VITE_BUILD),
		};
	}

	const configPaths = new Set<string>();
	const cloudflareEnv = prefixedEnv.CLOUDFLARE_ENV;
	const validateAndAddEnvironmentName = createEnvironmentNameValidator();

	let configPath: string | undefined;
	let rawConfigOverride: RawConfig | undefined;

	if (resolvedNewConfig) {
		if (pluginConfig.configPath) {
			throw new Error(
				"`configPath` cannot be used together with `experimental.newConfig`. Configure the entry Worker via `cloudflare.config.ts` instead."
			);
		}
		if (pluginConfig.auxiliaryWorkers?.length) {
			throw new Error(
				"`auxiliaryWorkers` are not yet supported when `experimental.newConfig` is enabled."
			);
		}
		const result = await loadNewConfig({
			root,
			mode: viteEnv.mode,
			generateTypes: resolvedNewConfig.types.generate,
		});
		configPath = result.configPath;
		rawConfigOverride = result.rawConfig;
		configPaths.add(result.configPath);
		for (const dep of result.dependencies) {
			configPaths.add(dep);
		}
	} else {
		const requestedEntryWorkerConfigPath =
			pluginConfig.configPath ??
			prefixedEnv.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH;
		configPath = getValidatedWranglerConfigPath(
			root,
			requestedEntryWorkerConfigPath
		);
	}

	// Build entry worker config: defaults → file config → config()
	const entryWorkerResolvedConfig = resolveWorkerConfig({
		root,
		configPath: resolvedNewConfig ? undefined : configPath,
		env: cloudflareEnv,
		configCustomizer: pluginConfig.config,
		visitedConfigPaths: configPaths,
		rawConfigOverride,
	});

	const environmentNameToWorkerMap = new Map<string, Worker>();
	const environmentNameToChildEnvironmentNamesMap = new Map<string, string[]>();

	const prerenderWorkerConfig = pluginConfig.experimental?.prerenderWorker;
	let prerenderWorkerEnvironmentName: string | undefined;

	if (prerenderWorkerConfig && viteEnv.command === "build") {
		const workerConfigPath = getValidatedWranglerConfigPath(
			root,
			prerenderWorkerConfig.configPath,
			true
		);

		const workerResolvedConfig = resolveWorkerConfig({
			root,
			configPath: workerConfigPath,
			env: cloudflareEnv,
			configCustomizer:
				"config" in prerenderWorkerConfig
					? prerenderWorkerConfig.config
					: undefined,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
			visitedConfigPaths: configPaths,
		});

		prerenderWorkerEnvironmentName =
			prerenderWorkerConfig.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.topLevelName);

		validateAndAddEnvironmentName(prerenderWorkerEnvironmentName);

		environmentNameToWorkerMap.set(
			prerenderWorkerEnvironmentName,
			resolveWorker(
				workerResolvedConfig.config as ResolvedWorkerConfig,
				undefined
			)
		);

		const prerenderWorkerChildEnvironments =
			prerenderWorkerConfig.viteEnvironment?.childEnvironments;

		if (prerenderWorkerChildEnvironments) {
			for (const childName of prerenderWorkerChildEnvironments) {
				validateAndAddEnvironmentName(childName);
			}

			environmentNameToChildEnvironmentNamesMap.set(
				prerenderWorkerEnvironmentName,
				prerenderWorkerChildEnvironments
			);
		}
	}

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			...shared,
			type: "assets-only",
			cloudflareEnv,
			config: entryWorkerResolvedConfig.config,
			environmentNameToWorkerMap,
			environmentNameToChildEnvironmentNamesMap,
			prerenderWorkerEnvironmentName,
			configPaths,
			remoteBindings,
			rawConfigs: {
				entryWorker: entryWorkerResolvedConfig,
			},
		};
	}

	let staticRouting: StaticRouting | undefined;

	if (
		Array.isArray(entryWorkerResolvedConfig.config.assets?.run_worker_first)
	) {
		staticRouting = parseStaticRouting(
			entryWorkerResolvedConfig.config.assets.run_worker_first
		);
	}

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironment?.name ??
		workerNameToEnvironmentName(entryWorkerResolvedConfig.config.topLevelName);

	validateAndAddEnvironmentName(entryWorkerEnvironmentName);

	environmentNameToWorkerMap.set(
		entryWorkerEnvironmentName,
		resolveWorker(entryWorkerResolvedConfig.config, pluginConfig.assetsOnly)
	);

	const entryWorkerChildEnvironments =
		pluginConfig.viteEnvironment?.childEnvironments;

	if (entryWorkerChildEnvironments) {
		for (const childName of entryWorkerChildEnvironments) {
			validateAndAddEnvironmentName(childName);
		}

		environmentNameToChildEnvironmentNamesMap.set(
			entryWorkerEnvironmentName,
			entryWorkerChildEnvironments
		);
	}

	const auxiliaryWorkersResolvedConfigs: WorkerResolvedConfig[] = [];

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const workerConfigPath = getValidatedWranglerConfigPath(
			root,
			auxiliaryWorker.configPath,
			true
		);

		// Build auxiliary worker config: defaults → file config → config()
		const workerResolvedConfig = resolveWorkerConfig({
			root,
			configPath: workerConfigPath,
			env: cloudflareEnv,
			configCustomizer:
				"config" in auxiliaryWorker ? auxiliaryWorker.config : undefined,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
			visitedConfigPaths: configPaths,
		});

		if (workerResolvedConfig.config.assets) {
			workerResolvedConfig.nonApplicable.notSupportedOnAuxiliary.add("assets");
		}

		auxiliaryWorkersResolvedConfigs.push(workerResolvedConfig);

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.topLevelName);

		validateAndAddEnvironmentName(workerEnvironmentName);

		environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(
				workerResolvedConfig.config as ResolvedWorkerConfig,
				auxiliaryWorker.devOnly
			)
		);

		const auxiliaryWorkerChildEnvironments =
			auxiliaryWorker.viteEnvironment?.childEnvironments;

		if (auxiliaryWorkerChildEnvironments) {
			for (const childName of auxiliaryWorkerChildEnvironments) {
				validateAndAddEnvironmentName(childName);
			}

			environmentNameToChildEnvironmentNamesMap.set(
				workerEnvironmentName,
				auxiliaryWorkerChildEnvironments
			);
		}
	}

	return {
		...shared,
		type: "workers",
		cloudflareEnv,
		configPaths,
		environmentNameToWorkerMap,
		environmentNameToChildEnvironmentNamesMap,
		prerenderWorkerEnvironmentName,
		entryWorkerEnvironmentName,
		staticRouting,
		remoteBindings,
		rawConfigs: {
			entryWorker: entryWorkerResolvedConfig,
			auxiliaryWorkers: auxiliaryWorkersResolvedConfigs,
		},
	};
}

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll("-", "_");
}

function createEnvironmentNameValidator() {
	const usedNames = new Set<string>();

	return (name: string): void => {
		if (name === "client") {
			throw new Error(`"client" is a reserved Vite environment name`);
		}

		if (usedNames.has(name)) {
			throw new Error(`Duplicate Vite environment name: "${name}"`);
		}

		usedNames.add(name);
	};
}

/**
 * Evaluates the `devOnly` value. Should be called lazily at build time
 * to allow frameworks to provide the value after initialization.
 */
export function resolveDevOnly(devOnly: DevOnly | undefined): boolean {
	if (typeof devOnly === "function") {
		return devOnly();
	}

	return devOnly ?? false;
}

function resolveWorker(
	workerConfig: ResolvedWorkerConfig,
	devOnly: DevOnly | undefined
): Worker {
	return {
		config: workerConfig,
		nodeJsCompat: hasNodeJsCompat(workerConfig)
			? new NodeJsCompat(workerConfig)
			: undefined,
		devOnly,
	};
}

const NEW_CONFIG_FILENAME = "cloudflare.config.ts";
const TYPES_OUTPUT_FILENAME = "worker-configuration.d.ts";
const EXPERIMENTAL_CONFIG_PKG = "@cloudflare/vite-plugin/experimental-config";

/**
 * Load and convert a `cloudflare.config.ts` file via `@cloudflare/config`. Returns
 * the resulting Wrangler `RawConfig`, the absolute path of the loaded file,
 * and the set of files imported while resolving the config (for watch-mode).
 *
 * If `generateTypes` is true, also writes `worker-configuration.d.ts` next to
 * the config when the generated content differs from what's already on disk.
 */
async function loadNewConfig(options: {
	root: string;
	mode: string;
	generateTypes: boolean;
}): Promise<{
	rawConfig: RawConfig;
	configPath: string;
	dependencies: Set<string>;
}> {
	const configPath = path.resolve(options.root, NEW_CONFIG_FILENAME);

	if (!fs.existsSync(configPath)) {
		throw new Error(
			`\`experimental.newConfig\` is enabled but no \`${NEW_CONFIG_FILENAME}\` was found at ${configPath}.`
		);
	}

	// Dynamic import so users who don't enable `experimental.newConfig` never
	// pay the cost of loading `@cloudflare/config` (and its Node module hooks).
	const {
		loadConfig,
		ConfigSchema,
		convertToWranglerConfig,
		generateTypes: generateTypesFn,
		resolveWorkerDefinition,
	} = await import("@cloudflare/config");

	const { config: rawExport, dependencies } = await loadConfig(configPath);

	const resolved = await resolveWorkerDefinition(rawExport, {
		mode: options.mode,
	});

	const parsed = ConfigSchema.safeParse(resolved);
	if (!parsed.success) {
		throw new Error(
			`Invalid \`${NEW_CONFIG_FILENAME}\`:\n${parsed.error.message}`
		);
	}

	const rawConfig = convertToWranglerConfig(parsed.data);

	if (options.generateTypes) {
		writeWorkerConfigurationDts({
			root: options.root,
			configPath,
			generateTypes: generateTypesFn,
		});
	}

	return { rawConfig, configPath, dependencies };
}

/**
 * Write `worker-configuration.d.ts` to the project root using
 * `@cloudflare/config`'s `generateTypes`, targeting the vite-plugin's
 * `experimental-config` subpath (so users don't need a direct dependency on
 * `@cloudflare/config`).
 *
 * Reads the existing file first and only writes if the content differs, to
 * avoid touching mtimes unnecessarily.
 */
function writeWorkerConfigurationDts(options: {
	root: string;
	configPath: string;
	generateTypes: (opts: { configPath: string; packageName?: string }) => string;
}): void {
	const outputPath = path.resolve(options.root, TYPES_OUTPUT_FILENAME);
	const relativeConfigPath =
		"./" + path.relative(options.root, options.configPath);
	const content = options.generateTypes({
		configPath: relativeConfigPath,
		packageName: EXPERIMENTAL_CONFIG_PKG,
	});

	let existing: string | undefined;
	try {
		existing = fs.readFileSync(outputPath, "utf8");
	} catch {
		// File doesn't exist yet — we'll create it below.
	}
	if (existing !== content) {
		fs.writeFileSync(outputPath, content);
	}
}
