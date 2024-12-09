import assert from 'node:assert';
import * as fs from 'node:fs';
import path from 'node:path';
import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare } from 'miniflare';
import * as vite from 'vite';
import { getRouterWorker } from './assets';
import {
	createCloudflareEnvironmentOptions,
	initRunners,
} from './cloudflare-environment';
import {
	getDevMiniflareOptions,
	getPreviewMiniflareOptions,
} from './miniflare-options';
import {
	getNodeCompatAliases,
	injectGlobalCode,
	resolveNodeAliases,
} from './node-js-compat';
import { resolvePluginConfig } from './plugin-config';
import { toMiniflareRequest } from './utils';
import type { PluginConfig, ResolvedPluginConfig } from './plugin-config';
import type { Unstable_RawConfig } from 'wrangler';

export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin {
	let resolvedPluginConfig: ResolvedPluginConfig;
	let miniflare: Miniflare | undefined;

	return {
		name: 'vite-plugin-cloudflare',
		config(userConfig) {
			resolvedPluginConfig = resolvePluginConfig(pluginConfig, userConfig);

			return {
				appType: 'custom',
				resolve: {
					alias: getNodeCompatAliases(),
				},
				environments:
					resolvedPluginConfig.type === 'workers'
						? Object.fromEntries(
								Object.entries(resolvedPluginConfig.workers).map(
									([environmentName, workerConfig]) => {
										return [
											environmentName,
											createCloudflareEnvironmentOptions(
												workerConfig,
												userConfig,
											),
										];
									},
								),
							)
						: undefined,
				builder: {
					async buildApp(builder) {
						const clientEnvironment = builder.environments.client;
						const defaultHtmlPath = path.resolve(
							builder.config.root,
							'index.html',
						);

						if (
							clientEnvironment &&
							(clientEnvironment.config.build.rollupOptions.input ||
								fs.existsSync(defaultHtmlPath))
						) {
							await builder.build(clientEnvironment);
						}

						if (resolvedPluginConfig.type === 'assets-only') {
							return;
						}

						const workerEnvironments = Object.keys(
							resolvedPluginConfig.workers,
						).map((environmentName) => {
							const environment = builder.environments[environmentName];

							assert(environment, `${environmentName} environment not found`);

							return environment;
						});

						await Promise.all(
							workerEnvironments.map((environment) =>
								builder.build(environment),
							),
						);
					},
				},
			};
		},
		configEnvironment(name, options) {
			if (resolvedPluginConfig.type === 'workers') {
				options.build = {
					...options.build,
					// Puts all environment builds in subdirectories of the same build directory
					// TODO: allow the user to override this
					outDir: path.join(options.build?.outDir ?? 'dist', name),
				};
			}
		},
		async resolveId(source) {
			if (resolvedPluginConfig.type === 'assets-only') {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[this.environment.name];

			if (!workerConfig) {
				return;
			}

			const aliased = resolveNodeAliases(source, workerConfig);

			if (!aliased) {
				return;
			}

			if (aliased.external) {
				return aliased.id;
			} else {
				return await this.resolve(aliased.id);
			}
		},
		async transform(code, id) {
			if (resolvedPluginConfig.type === 'assets-only') {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[this.environment.name];

			if (!workerConfig) {
				return;
			}

			const resolvedId = await this.resolve(workerConfig.main);

			if (id === resolvedId?.id) {
				return injectGlobalCode(id, code, workerConfig);
			}
		},
		generateBundle(_, bundle) {
			let config: Unstable_RawConfig | undefined;

			if (resolvedPluginConfig.type === 'workers') {
				const workerConfig =
					resolvedPluginConfig.workers[this.environment.name];

				const entryChunk = Object.entries(bundle).find(
					([_, chunk]) => chunk.type === 'chunk' && chunk.isEntry,
				);

				if (!workerConfig || !entryChunk) {
					return;
				}

				workerConfig.main = entryChunk[0];

				const isEntryWorker =
					this.environment.name ===
					resolvedPluginConfig.entryWorkerEnvironmentName;

				if (isEntryWorker && workerConfig.assets) {
					workerConfig.assets.directory = path.join('..', 'client');
				}

				config = workerConfig;
			} else if (this.environment.name === 'client') {
				const assetsOnlyConfig = resolvedPluginConfig.config;

				assetsOnlyConfig.assets.directory = '.';

				this.emitFile({
					type: 'asset',
					fileName: '.assetsignore',
					source: 'wrangler.json',
				});

				config = assetsOnlyConfig;
			}

			if (!config) {
				return;
			}

			config.no_bundle = true;
			config.rules = [{ type: 'ESModule', globs: ['**/*.js'] }];
			// Setting this to `undefined` for now because `readConfig` will error when reading the output file if it's set to an empty object. This needs to be fixed in Wrangler.
			config.unsafe = undefined;

			this.emitFile({
				type: 'asset',
				fileName: 'wrangler.json',
				source: JSON.stringify(config),
			});
		},
		handleHotUpdate(options) {
			if (resolvedPluginConfig.configPaths.has(options.file)) {
				options.server.restart();
			}
		},
		async buildEnd() {
			if (miniflare) {
				await miniflare.dispose();
				miniflare = undefined;
			}
		},
		async configureServer(viteDevServer) {
			miniflare = new Miniflare(
				getDevMiniflareOptions(resolvedPluginConfig, viteDevServer),
			);

			await initRunners(resolvedPluginConfig, viteDevServer, miniflare);
			const routerWorker = await getRouterWorker(miniflare);

			const middleware = createMiddleware(async ({ request }) => {
				return routerWorker.fetch(toMiniflareRequest(request), {
					redirect: 'manual',
				}) as any;
			});

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					if (!middleware) {
						next();
						return;
					}

					middleware(req, res, next);
				});
			};
		},
		configurePreviewServer(vitePreviewServer) {
			const miniflare = new Miniflare(
				getPreviewMiniflareOptions(resolvedPluginConfig, vitePreviewServer),
			);

			const middleware = createMiddleware(({ request }) => {
				return miniflare.dispatchFetch(toMiniflareRequest(request), {
					redirect: 'manual',
				}) as any;
			});

			return () => {
				vitePreviewServer.middlewares.use((req, res, next) => {
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
