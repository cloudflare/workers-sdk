import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import { getLocalWorkerdCompatibilityDate } from "@cloudflare/workers-utils";
import { defu } from "defu";
import * as vite from "vite";
import * as wrangler from "wrangler";
import { getWorkerConfigs } from "./deploy-config";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import {
	getValidatedWranglerConfigPath,
	readWorkerConfigFromFile,
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
import type { Unstable_Config } from "wrangler";

export type PersistState = boolean | { path: string };

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string; childEnvironments?: string[] };
}

interface EntryWorkerConfig extends BaseWorkerConfig {
	configPath?: string;
}

interface AuxiliaryWorkerFileConfig extends BaseWorkerConfig {
	configPath: string;
}

interface AuxiliaryWorkerInlineConfig extends BaseWorkerConfig {
	configPath?: string;
	config: WorkerConfigCustomizer<false>;
}

type AuxiliaryWorkerConfig =
	| AuxiliaryWorkerFileConfig
	| AuxiliaryWorkerInlineConfig;

interface Experimental {
	/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
	headersAndRedirectsDevModeSupport?: boolean;
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
	experimental?: Experimental;
	config?: WorkerConfigCustomizer<true>;
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
}

interface BaseResolvedConfig {
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	experimental: Experimental;
	remoteBindings: boolean;
}

export interface AssetsOnlyResolvedConfig extends BaseResolvedConfig {
	type: "assets-only";
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	config: ResolvedAssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

export interface WorkersResolvedConfig extends BaseResolvedConfig {
	type: "workers";
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
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

	if (options.configPath) {
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

	const { date } = getLocalWorkerdCompatibilityDate({
		projectPath: options.root,
	});

	workerConfig.compatibility_date ??= date;

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

export function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): ResolvedPluginConfig {
	const shared = {
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
		experimental: pluginConfig.experimental ?? {},
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

	if (viteEnv.isPreview) {
		return {
			...shared,
			remoteBindings: pluginConfig.remoteBindings ?? true,
			type: "preview",
			workers: getWorkerConfigs(root),
		};
	}

	const configPaths = new Set<string>();
	const cloudflareEnv = prefixedEnv.CLOUDFLARE_ENV;
	const configPath = getValidatedWranglerConfigPath(
		root,
		pluginConfig.configPath
	);

	// Build entry worker config: defaults → file config → config()
	const entryWorkerResolvedConfig = resolveWorkerConfig({
		root,
		configPath,
		env: prefixedEnv.CLOUDFLARE_ENV,
		configCustomizer: pluginConfig.config,
		visitedConfigPaths: configPaths,
	});

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			...shared,
			type: "assets-only",
			cloudflareEnv,
			config: entryWorkerResolvedConfig.config,
			configPaths,
			remoteBindings: pluginConfig.remoteBindings ?? true,
			rawConfigs: {
				entryWorker: entryWorkerResolvedConfig,
			},
		};
	}

	const entryWorkerConfig = entryWorkerResolvedConfig.config;

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironment?.name ??
		workerNameToEnvironmentName(entryWorkerConfig.topLevelName);

	const validateAndAddEnvironmentName = createEnvironmentNameValidator();
	validateAndAddEnvironmentName(entryWorkerEnvironmentName);

	let staticRouting: StaticRouting | undefined;

	if (Array.isArray(entryWorkerConfig.assets?.run_worker_first)) {
		staticRouting = parseStaticRouting(
			entryWorkerConfig.assets.run_worker_first
		);
	}

	const environmentNameToWorkerMap: Map<string, Worker> = new Map([
		[entryWorkerEnvironmentName, resolveWorker(entryWorkerConfig)],
	]);

	const environmentNameToChildEnvironmentNamesMap = new Map<string, string[]>();

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
			entryWorkerConfig,
			visitedConfigPaths: configPaths,
		});

		auxiliaryWorkersResolvedConfigs.push(workerResolvedConfig);

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.topLevelName);

		validateAndAddEnvironmentName(workerEnvironmentName);

		environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(workerResolvedConfig.config as ResolvedWorkerConfig)
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
		entryWorkerEnvironmentName,
		staticRouting,
		remoteBindings: pluginConfig.remoteBindings ?? true,
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

function resolveWorker(workerConfig: ResolvedWorkerConfig) {
	return {
		config: workerConfig,
		nodeJsCompat: hasNodeJsCompat(workerConfig)
			? new NodeJsCompat(workerConfig)
			: undefined,
	};
}
