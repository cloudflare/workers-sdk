import * as path from 'node:path';
import * as vite from 'vite';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import type { SourcelessWorkerOptions } from 'wrangler';

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
	workers: Record<
		string,
		{
			name: string;
			entryPath: string;
			wranglerConfigPath: string;
			workerOptions: SourcelessWorkerOptions;
		}
	>;
	entryWorkerName?: string;
	persistPath: string | false;
	wranglerConfigPaths: Set<string>;
}

const DEFAULT_PERSIST_PATH = '.wrangler/state/v3';

export function normalizePluginConfig(
	pluginConfig: PluginConfig,
	viteConfig: vite.ResolvedConfig,
): NormalizedPluginConfig {
	const wranglerConfigPaths = new Set<string>();
	const workers = Object.fromEntries(
		Object.entries(pluginConfig.workers).map(([name, options]) => {
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

			const { workerOptions } =
				unstable_getMiniflareWorkerOptions(wranglerConfigPath);

			return [
				name,
				{
					name,
					entryPath: options.main,
					wranglerConfigPath,
					workerOptions,
				},
			];
		}),
	);

	const persistPath =
		pluginConfig.persistTo === false
			? false
			: path.resolve(
					viteConfig.root,
					pluginConfig.persistTo ?? DEFAULT_PERSIST_PATH,
				);

	return {
		workers,
		entryWorkerName: pluginConfig.entryWorker,
		persistPath,
		wranglerConfigPaths,
	};
}
