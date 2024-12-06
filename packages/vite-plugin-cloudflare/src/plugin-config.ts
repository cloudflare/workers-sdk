import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vite from 'vite';
import { unstable_readConfig } from 'wrangler';
import { invariant } from './shared';
import type { Unstable_Config } from 'wrangler';

export interface PluginConfig {
	wranglerConfig?: string;
	viteEnvironmentName?: string;
	auxiliaryWorkers?: Array<{
		wranglerConfig: string;
		viteEnvironmentName?: string;
	}>;
}

type Defined<T> = Exclude<T, undefined>;

export type AssetsOnlyConfig = Unstable_Config & {
	assets: Defined<Unstable_Config['assets']>;
};

export type WorkerConfig = Unstable_Config & {
	name: Defined<Unstable_Config['name']>;
	main: Defined<Unstable_Config['main']>;
};

interface AssetsOnlyResult {
	type: 'assets-only';
	config: AssetsOnlyConfig;
}

interface WorkerResult {
	type: 'worker';
	config: WorkerConfig;
}

interface BasePluginConfig {
	wranglerConfigPaths: Set<string>;
}

interface AssetsOnlyPluginConfig extends BasePluginConfig {
	type: 'assets-only';
	config: AssetsOnlyConfig;
}

interface WorkersPluginConfig extends BasePluginConfig {
	type: 'workers';
	workers: Record<string, WorkerConfig>;
	entryWorkerEnvironmentName: string;
}

export type ResolvedPluginConfig = AssetsOnlyPluginConfig | WorkersPluginConfig;

function getConfigResult(
	configPath: string,
	wranglerConfigPaths: Set<string>,
	isEntryWorker?: boolean,
): AssetsOnlyResult | WorkerResult {
	if (wranglerConfigPaths.has(configPath)) {
		throw new Error(`Duplicate Wrangler config path found: ${configPath}`);
	}

	const wranglerConfig = unstable_readConfig(configPath, {});

	wranglerConfigPaths.add(configPath);

	if (isEntryWorker && !wranglerConfig.main) {
		invariant(
			wranglerConfig.assets,
			`No main or assets field provided in ${wranglerConfig.configPath}`,
		);

		return {
			type: 'assets-only',
			config: { ...wranglerConfig, assets: wranglerConfig.assets },
		};
	}

	invariant(
		wranglerConfig.main,
		`No main field provided in ${wranglerConfig.configPath}`,
	);

	invariant(
		wranglerConfig.name,
		`No name field provided in ${wranglerConfig.configPath}`,
	);

	return {
		type: 'worker',
		config: {
			...wranglerConfig,
			name: wranglerConfig.name,
			main: wranglerConfig.main,
		},
	};
}

// We can't rely on `readConfig` from Wrangler to find the config as it may be relative to a different root that's set by the user.
function findWranglerConfig(root: string): string | undefined {
	for (const extension of ['json', 'jsonc', 'toml']) {
		const configPath = path.join(root, `wrangler.${extension}`);

		if (fs.existsSync(configPath)) {
			return configPath;
		}
	}
}

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll('-', '_');
}

export function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
): ResolvedPluginConfig {
	const wranglerConfigPaths = new Set<string>();
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();

	const configPath = pluginConfig.wranglerConfig
		? path.join(root, pluginConfig.wranglerConfig)
		: findWranglerConfig(root);

	invariant(
		configPath,
		`Config not found. Have you created a wrangler.json(c) or wrangler.toml file?`,
	);

	const entryConfigResult = getConfigResult(
		configPath,
		wranglerConfigPaths,
		true,
	);

	if (entryConfigResult.type === 'assets-only') {
		return { ...entryConfigResult, wranglerConfigPaths };
	}

	const entryWorkerConfig = entryConfigResult.config;

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironmentName ??
		workerNameToEnvironmentName(entryWorkerConfig.name);

	const workers = {
		[entryWorkerEnvironmentName]: entryWorkerConfig,
	};

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const configResult = getConfigResult(
			path.join(root, auxiliaryWorker.wranglerConfig),
			wranglerConfigPaths,
		);

		invariant(
			configResult.type === 'worker',
			'Unexpected error: received AssetsOnlyResult with auxiliary workers.',
		);

		const workerConfig = configResult.config;

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironmentName ??
			workerNameToEnvironmentName(workerConfig.name);

		if (workers[workerEnvironmentName]) {
			throw new Error(
				`Duplicate Vite environment name found: ${workerEnvironmentName}`,
			);
		}

		workers[workerEnvironmentName] = workerConfig;
	}

	return {
		type: 'workers',
		wranglerConfigPaths,
		workers,
		entryWorkerEnvironmentName,
	};
}
