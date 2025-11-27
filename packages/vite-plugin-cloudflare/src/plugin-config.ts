import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import { defu } from "defu";
import * as vite from "vite";
import {
	unstable_defaultWranglerConfig,
	unstable_getDevCompatibilityDate,
	unstable_getWorkerNameFromProject,
} from "wrangler";
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
	SanitizedWorkerConfig,
	WorkerResolvedConfig,
	WorkerWithServerLogicResolvedConfig,
} from "./workers-configs";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { Unstable_Config } from "wrangler";

export type PersistState = boolean | { path: string };

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string };
}

interface EntryWorkerConfig extends BaseWorkerConfig {
	configPath?: string;
}

interface AuxiliaryWorkerFileConfig extends BaseWorkerConfig {
	configPath: string;
}

interface AuxiliaryWorkerInlineConfig extends BaseWorkerConfig {
	configPath?: string;
	configure: ConfigureWorker;
}

type AuxiliaryWorkerConfig =
	| AuxiliaryWorkerFileConfig
	| AuxiliaryWorkerInlineConfig;

interface Experimental {
	/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
	headersAndRedirectsDevModeSupport?: boolean;
}

type ConfigureWorker =
	| Partial<SanitizedWorkerConfig>
	| ((config: SanitizedWorkerConfig) => Partial<SanitizedWorkerConfig> | void);

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
	inspectorPort?: number | false;
	remoteBindings?: boolean;
	experimental?: Experimental;
	configure?: ConfigureWorker;
}

export interface AssetsOnlyConfig extends SanitizedWorkerConfig {
	topLevelName: Defined<SanitizedWorkerConfig["topLevelName"]>;
	name: Defined<SanitizedWorkerConfig["name"]>;
	compatibility_date: Defined<SanitizedWorkerConfig["compatibility_date"]>;
}

export interface WorkerConfig extends AssetsOnlyConfig {
	main: Defined<SanitizedWorkerConfig["main"]>;
}

export interface Worker {
	config: WorkerConfig;
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
	config: AssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

export interface WorkersResolvedConfig extends BaseResolvedConfig {
	type: "workers";
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	environmentNameToWorkerMap: Map<string, Worker>;
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

export function customizeWorkerConfig<T extends SanitizedWorkerConfig>(
	resolvedConfig: T,
	configure: ConfigureWorker | undefined
): T {
	// The `configure` option can either be an object to merge into the config,
	// a function that returns such an object, or a function that mutates the config in place.
	const configureResult =
		typeof configure === "function" ? configure(resolvedConfig) : configure;

	// If the configureResult is defined, merge it into the existing config.
	if (configureResult) {
		return defu(configureResult, resolvedConfig) as T;
	}
	return resolvedConfig;
}

/**
 * Resolves the config for a single worker, applying defaults, file config, and configure().
 */
function resolveWorkerConfig({
	configPath,
	env,
	configure,
	visitedConfigPaths,
	isEntryWorker,
	root,
}: {
	configPath: string | undefined;
	env: string | undefined;
	configure: ConfigureWorker | undefined;
	visitedConfigPaths: Set<string>;
	isEntryWorker: boolean;
	root: string;
}): WorkerResolvedConfig {
	let config: SanitizedWorkerConfig;
	let raw: Unstable_Config;
	let nonApplicable: NonApplicableConfigMap;

	if (configPath) {
		// File config already has defaults applied
		({ raw, config, nonApplicable } = readWorkerConfigFromFile(
			configPath,
			env,
			{
				visitedConfigPaths,
			}
		));
	} else {
		// No file: start with defaults
		config = { ...unstable_defaultWranglerConfig };
		raw = { ...config };
		nonApplicable = {
			replacedByVite: new Set(),
			notRelevant: new Set(),
		};
	}

	config.compatibility_date ??= unstable_getDevCompatibilityDate(undefined);

	// Apply configure()
	config = customizeWorkerConfig(config, configure);

	if (isEntryWorker) {
		config.name ??= unstable_getWorkerNameFromProject(root);
	}
	// Auto-populate topLevelName from name
	config.topLevelName ??= config.name;

	return resolveWorkerType(config, raw, nonApplicable, {
		isEntryWorker,
		configPath,
		env,
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

	// Build entry worker config: defaults → file config → configure()
	const entryWorkerResolvedConfig = resolveWorkerConfig({
		root,
		configPath,
		env: prefixedEnv.CLOUDFLARE_ENV,
		configure: pluginConfig.configure,
		visitedConfigPaths: configPaths,
		isEntryWorker: true,
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

	let staticRouting: StaticRouting | undefined;

	if (Array.isArray(entryWorkerConfig.assets?.run_worker_first)) {
		staticRouting = parseStaticRouting(
			entryWorkerConfig.assets.run_worker_first
		);
	}

	const environmentNameToWorkerMap: Map<string, Worker> = new Map([
		[entryWorkerEnvironmentName, resolveWorker(entryWorkerConfig)],
	]);

	const auxiliaryWorkersResolvedConfigs: WorkerResolvedConfig[] = [];

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const workerConfigPath = getValidatedWranglerConfigPath(
			root,
			auxiliaryWorker.configPath,
			true
		);

		// Build auxiliary worker config: defaults → file config → configure()
		const workerResolvedConfig = resolveWorkerConfig({
			root,
			configPath: workerConfigPath,
			env: cloudflareEnv,
			configure:
				"configure" in auxiliaryWorker ? auxiliaryWorker.configure : undefined,
			visitedConfigPaths: configPaths,
			isEntryWorker: false,
		});

		auxiliaryWorkersResolvedConfigs.push(workerResolvedConfig);

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.topLevelName);

		if (environmentNameToWorkerMap.has(workerEnvironmentName)) {
			throw new Error(
				`Duplicate Vite environment name found: ${workerEnvironmentName}`
			);
		}

		environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(workerResolvedConfig.config as WorkerConfig)
		);
	}

	return {
		...shared,
		type: "workers",
		cloudflareEnv,
		configPaths,
		environmentNameToWorkerMap,
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

function resolveWorker(workerConfig: WorkerConfig) {
	return {
		config: workerConfig,
		nodeJsCompat: hasNodeJsCompat(workerConfig)
			? new NodeJsCompat(workerConfig)
			: undefined,
	};
}
