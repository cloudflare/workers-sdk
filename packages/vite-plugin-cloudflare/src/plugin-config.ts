import * as path from 'node:path';
import * as vite from 'vite';

export interface WorkerOptions {
	main: string;
	wranglerConfig?: string;
	overrides?: vite.EnvironmentOptions;
}

export interface PluginConfig<
	TWorkers extends Record<string, WorkerOptions> = Record<
		string,
		WorkerOptions
	>,
	TEntryWorker extends string = Extract<keyof TWorkers, string>,
> {
	workers: TWorkers;
	entryWorker?: TEntryWorker;
	persistTo?: string | false;
}

export interface NormalizedPluginConfig {
	workers: Array<{
		name: string;
		entryPath: string;
		wranglerConfigPath: string;
	}>;
	entryWorkerName?: string;
	persistPath: string | false;
}

const DEFAULT_PERSIST_PATH = '.wrangler/state/v3';

export function normalizePluginConfig(
	pluginConfig: PluginConfig,
	viteConfig: vite.ResolvedConfig,
): {
	normalizedPluginConfig: NormalizedPluginConfig;
	wranglerConfigPaths: Set<string>;
} {
	const wranglerConfigPaths = new Set<string>();
	const workers = Object.entries(pluginConfig.workers).map(
		([name, options]) => {
			const wranglerConfigPath = path.resolve(
				viteConfig.root,
				options.wranglerConfig ?? './wrangler.toml',
			);

			if (wranglerConfigPaths.has(wranglerConfigPath)) {
				throw new Error(
					`Duplicate Wrangler config path found: ${wranglerConfigPath}`,
				);
			}

			wranglerConfigPaths.add(wranglerConfigPath);

			return {
				name,
				entryPath: options.main,
				wranglerConfigPath,
			};
		},
	);

	const persistPath =
		pluginConfig.persistTo === false
			? false
			: path.resolve(
					viteConfig.root,
					pluginConfig.persistTo ?? DEFAULT_PERSIST_PATH,
				);

	return {
		normalizedPluginConfig: {
			workers,
			entryWorkerName: pluginConfig.entryWorker,
			persistPath,
		},
		wranglerConfigPaths,
	};
}
