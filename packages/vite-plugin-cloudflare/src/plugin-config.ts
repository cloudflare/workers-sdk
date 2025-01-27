import assert from "node:assert";
import * as path from "node:path";
import * as vite from "vite";
import { findWranglerConfig, getWorkerConfig } from "./workers-configs";
import type {
	AssetsOnlyWorkerResolvedConfig,
	SanitizedWorkerConfig,
	WorkerResolvedConfig,
	WorkerWithServerLogicResolvedConfig,
} from "./workers-configs";

export type PersistState = boolean | { path: string };

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string };
}

interface EntryWorkerConfig extends BaseWorkerConfig {
	configPath?: string;
}

interface AuxiliaryWorkerConfig extends BaseWorkerConfig {
	configPath: string;
}

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
}

type Defined<T> = Exclude<T, undefined>;

interface BaseConfig extends SanitizedWorkerConfig {
	topLevelName: Defined<SanitizedWorkerConfig["topLevelName"]>;
	name: Defined<SanitizedWorkerConfig["name"]>;
	compatibility_date: Defined<SanitizedWorkerConfig["compatibility_date"]>;
}

export interface AssetsOnlyConfig extends BaseConfig {
	assets: Defined<SanitizedWorkerConfig["assets"]>;
}

export interface WorkerConfig extends BaseConfig {
	main: Defined<SanitizedWorkerConfig["main"]>;
}

interface BasePluginConfig {
	configPaths: Set<string>;
	persistState: PersistState;
	cloudflareEnv: string | undefined;
}

interface AssetsOnlyPluginConfig extends BasePluginConfig {
	type: "assets-only";
	config: AssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

interface WorkerPluginConfig extends BasePluginConfig {
	type: "workers";
	workers: Record<string, WorkerConfig>;
	entryWorkerEnvironmentName: string;
	rawConfigs: {
		entryWorker: WorkerWithServerLogicResolvedConfig;
		auxiliaryWorkers: WorkerResolvedConfig[];
	};
}

export type ResolvedPluginConfig = AssetsOnlyPluginConfig | WorkerPluginConfig;

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll("-", "_");
}

export function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): ResolvedPluginConfig {
	const configPaths = new Set<string>();
	const persistState = pluginConfig.persistState ?? true;
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const { CLOUDFLARE_ENV: cloudflareEnv } = vite.loadEnv(
		viteEnv.mode,
		root,
		/* prefixes */ ""
	);

	const configPath = pluginConfig.configPath
		? path.resolve(root, pluginConfig.configPath)
		: findWranglerConfig(root);

	assert(
		configPath,
		`Config not found. Have you created a wrangler.json(c) or wrangler.toml file?`
	);

	const entryWorkerResolvedConfig = getWorkerConfig(configPath, cloudflareEnv, {
		visitedConfigPaths: configPaths,
		isEntryWorker: true,
	});

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			type: "assets-only",
			config: entryWorkerResolvedConfig.config,
			configPaths,
			persistState,
			rawConfigs: {
				entryWorker: entryWorkerResolvedConfig,
			},
			cloudflareEnv,
		};
	}

	const entryWorkerConfig = entryWorkerResolvedConfig.config;

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironment?.name ??
		workerNameToEnvironmentName(entryWorkerConfig.topLevelName);

	const workers = {
		[entryWorkerEnvironmentName]: entryWorkerConfig,
	};

	const auxiliaryWorkersResolvedConfigs: WorkerResolvedConfig[] = [];

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const workerResolvedConfig = getWorkerConfig(
			path.resolve(root, auxiliaryWorker.configPath),
			cloudflareEnv,
			{
				visitedConfigPaths: configPaths,
			}
		);

		auxiliaryWorkersResolvedConfigs.push(workerResolvedConfig);

		assert(
			workerResolvedConfig.type === "worker",
			"Unexpected error: received AssetsOnlyResult with auxiliary workers."
		);

		const workerConfig = workerResolvedConfig.config;

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerConfig.topLevelName);

		if (workers[workerEnvironmentName]) {
			throw new Error(
				`Duplicate Vite environment name found: ${workerEnvironmentName}`
			);
		}

		workers[workerEnvironmentName] = workerConfig;
	}

	return {
		type: "workers",
		configPaths,
		persistState,
		workers,
		entryWorkerEnvironmentName,
		rawConfigs: {
			entryWorker: entryWorkerResolvedConfig,
			auxiliaryWorkers: auxiliaryWorkersResolvedConfigs,
		},
		cloudflareEnv,
	};
}
