import * as path from "node:path";
import * as wrangler from "wrangler";
import { DEFAULT_COMPATIBILITY_DATE } from "./constants";
import type { Unstable_Config } from "wrangler";

export type PersistState = boolean | { path: string };

export type WorkerConfigCustomizer =
	| Partial<Unstable_Config>
	| ((config: Unstable_Config) => Partial<Unstable_Config> | void);

export interface PluginConfig {
	configPath?: string;
	config?: WorkerConfigCustomizer;
	persistState?: PersistState;
	inspectorPort?: number | false;
}

export interface ResolvedPluginConfig {
	root: string;
	cloudflareEnv: string | undefined;
	configPath: string | undefined;
	environmentName: string;
	workerConfig: Unstable_Config & {
		name: string;
		main: string;
		compatibility_date: string;
	};
	persistState: PersistState;
	inspectorPort: number | false | undefined;
}

export function resolvePluginConfig(
	pluginConfig: PluginConfig,
	options: {
		root: string;
	}
): ResolvedPluginConfig {
	const root = path.resolve(options.root);
	const cloudflareEnv = process.env.CLOUDFLARE_ENV;
	const requestedConfigPath =
		pluginConfig.configPath ??
		process.env.CLOUDFLARE_RSBUILD_WRANGLER_CONFIG_PATH ??
		process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH;
	const configPath = requestedConfigPath
		? path.resolve(root, requestedConfigPath)
		: undefined;

	const workerConfig = configPath
		? wrangler.unstable_readConfig(
				{ config: configPath, env: cloudflareEnv },
				{ preserveOriginalMain: true }
			)
		: structuredClone(wrangler.unstable_defaultWranglerConfig);

	const customizedConfig = customizeWorkerConfig(
		workerConfig,
		pluginConfig.config
	);
	customizedConfig.compatibility_date ??= DEFAULT_COMPATIBILITY_DATE;
	customizedConfig.name ??= wrangler.unstable_getWorkerNameFromProject(root);
	customizedConfig.topLevelName ??= customizedConfig.name;

	if (!customizedConfig.main) {
		throw new Error(
			"Cloudflare Rsbuild plugin requires a Worker entrypoint. Set `main` in wrangler.json or pass `cloudflare({ config: { main: ... } })`."
		);
	}

	return {
		root,
		cloudflareEnv,
		configPath,
		environmentName: workerNameToEnvironmentName(customizedConfig.topLevelName),
		workerConfig: customizedConfig as ResolvedPluginConfig["workerConfig"],
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
	};
}

function customizeWorkerConfig(
	workerConfig: Unstable_Config,
	configCustomizer: WorkerConfigCustomizer | undefined
): Unstable_Config {
	const configResult =
		typeof configCustomizer === "function"
			? configCustomizer(workerConfig)
			: configCustomizer;

	return configResult
		? ({ ...workerConfig, ...configResult } as Unstable_Config)
		: workerConfig;
}

function workerNameToEnvironmentName(workerName: string): string {
	return workerName.replaceAll("-", "_");
}
