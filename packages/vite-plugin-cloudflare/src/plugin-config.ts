import assert from "node:assert";
import * as path from "node:path";
import * as vite from "vite";
import {
	getValidatedWranglerConfigPath,
	getWorkerConfig,
} from "./workers-configs";
import type { Defined } from "./utils";
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
	inspectorPort?: number | false;
	experimental?: {
		/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
		headersAndRedirectsDevModeSupport?: boolean;
	};
}

export interface AssetsOnlyConfig extends SanitizedWorkerConfig {
	topLevelName: Defined<SanitizedWorkerConfig["topLevelName"]>;
	name: Defined<SanitizedWorkerConfig["name"]>;
	compatibility_date: Defined<SanitizedWorkerConfig["compatibility_date"]>;
}

export interface WorkerConfig extends AssetsOnlyConfig {
	main: Defined<SanitizedWorkerConfig["main"]>;
}

interface BasePluginConfig {
	configPaths: Set<string>;
	persistState: PersistState;
	cloudflareEnv: string | undefined;
	experimental: {
		/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
		headersAndRedirectsDevModeSupport?: boolean;
	};
}

interface AssetsOnlyPluginConfig extends BasePluginConfig {
	type: "assets-only";
	config: AssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

export interface WorkerPluginConfig extends BasePluginConfig {
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
	const experimental = pluginConfig.experimental ?? {};
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const { CLOUDFLARE_ENV: cloudflareEnv } = vite.loadEnv(
		viteEnv.mode,
		root,
		/* prefixes */ ""
	);

	const entryWorkerConfigPath = getValidatedWranglerConfigPath(
		root,
		pluginConfig.configPath
	);

	const entryWorkerResolvedConfig = getWorkerConfig(
		entryWorkerConfigPath,
		cloudflareEnv,
		{
			visitedConfigPaths: configPaths,
			isEntryWorker: true,
		}
	);

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
			experimental,
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
		const workerConfigPath = getValidatedWranglerConfigPath(
			root,
			auxiliaryWorker.configPath,
			true
		);
		const workerResolvedConfig = getWorkerConfig(
			workerConfigPath,
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
		experimental,
	};
}
