import * as vite from 'vite';
import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare } from 'miniflare';
import {
	createCloudflareEnvironment,
	initRunners,
} from './cloudflare-environment';
import { normalizePluginConfig } from './plugin-config';
import { getMiniflareOptions } from './miniflare-options';
import type { WorkerOptions, PluginConfig } from './plugin-config';
import type { CloudflareDevEnvironment } from './cloudflare-environment';

export function cloudflare<T extends Record<string, WorkerOptions>>(
	pluginConfig: PluginConfig<T>,
): vite.Plugin {
	let viteConfig: vite.ResolvedConfig;

	return {
		name: 'vite-plugin-cloudflare',
		config() {
			return {
				environments: Object.fromEntries(
					Object.entries(pluginConfig.workers).map(([name, options]) => {
						return [name, createCloudflareEnvironment(options)];
					}),
				),
			};
		},
		configResolved(resolvedConfig) {
			viteConfig = resolvedConfig;
		},
		async configureServer(viteDevServer) {
			const { normalizedPluginConfig, wranglerConfigPaths } =
				normalizePluginConfig(pluginConfig, viteConfig);

			const miniflare = new Miniflare(
				getMiniflareOptions(normalizedPluginConfig, viteConfig, viteDevServer),
			);

			await initRunners(normalizedPluginConfig, miniflare, viteDevServer);

			viteDevServer.watcher.on('all', async (_, path) => {
				if (!wranglerConfigPaths.has(path)) {
					return;
				}

				await miniflare.setOptions(
					getMiniflareOptions(
						normalizedPluginConfig,
						viteConfig,
						viteDevServer,
					),
				);

				await initRunners(normalizedPluginConfig, miniflare, viteDevServer);
			});

			const middleware =
				pluginConfig.entryWorker &&
				createMiddleware(
					(context) => {
						return (
							viteDevServer.environments[
								pluginConfig.entryWorker as string
							] as CloudflareDevEnvironment
						).dispatchFetch(context.request);
					},
					{ alwaysCallNext: false },
				);

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					req.url = req.originalUrl;

					if (!middleware) {
						next();
						return;
					}

					middleware(req, res, next);
				});
			};
		},
	};
}
