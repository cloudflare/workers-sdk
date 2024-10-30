import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare } from 'miniflare';
import * as vite from 'vite';
import {
	createCloudflareEnvironmentOptions,
	initRunners,
} from './cloudflare-environment';
import { getMiniflareOptions } from './miniflare-options';
import { normalizePluginConfig } from './plugin-config';
import { invariant } from './shared';
import type { CloudflareDevEnvironment } from './cloudflare-environment';
import type { PluginConfig, WorkerOptions } from './plugin-config';

export function cloudflare<T extends Record<string, WorkerOptions>>(
	pluginConfig: PluginConfig<T>,
): vite.Plugin {
	let viteConfig: vite.ResolvedConfig;

	return {
		name: 'vite-plugin-cloudflare',
		config() {
			return {
				appType: 'custom',
				builder: {
					async buildApp(builder) {
						const environments = Object.keys(pluginConfig.workers).map(
							(name) => {
								const environment = builder.environments[name];
								invariant(environment, `${name} environment not found`);

								return environment;
							},
						);

						await Promise.all(
							environments.map((environment) => builder.build(environment)),
						);
					},
				},
				// Ensure there is an environment for each worker
				environments: Object.fromEntries(
					Object.entries(pluginConfig.workers).map(([name, workerOptions]) => [
						name,
						createCloudflareEnvironmentOptions(name, workerOptions),
					]),
				),
			};
		},
		configResolved(resolvedConfig) {
			viteConfig = resolvedConfig;
		},
		async configureServer(viteDevServer) {
			const { normalizedPluginConfig, wranglerConfigPaths } =
				normalizePluginConfig(pluginConfig, viteConfig);

			let error: unknown;

			const miniflare = new Miniflare(
				getMiniflareOptions(normalizedPluginConfig, viteConfig, viteDevServer),
			);

			await initRunners(normalizedPluginConfig, miniflare, viteDevServer);

			viteDevServer.watcher.on('all', async (_, path) => {
				if (!wranglerConfigPaths.has(path)) {
					return;
				}

				try {
					await miniflare.setOptions(
						getMiniflareOptions(
							normalizedPluginConfig,
							viteConfig,
							viteDevServer,
						),
					);

					await initRunners(normalizedPluginConfig, miniflare, viteDevServer);

					error = undefined;
					viteDevServer.environments.client.hot.send({ type: 'full-reload' });
				} catch (err) {
					error = err;
					viteDevServer.environments.client.hot.send({ type: 'full-reload' });
				}
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
					if (error) {
						throw error;
					}

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
