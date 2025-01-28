import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { createMiddleware } from "@hattip/adapter-node";
import { Miniflare } from "miniflare";
import * as vite from "vite";
import {
	createCloudflareEnvironmentOptions,
	initRunners,
} from "./cloudflare-environment";
import { writeDeployConfig } from "./deploy-config";
import { getDevEntryWorker } from "./dev";
import {
	getDevMiniflareOptions,
	getPreviewMiniflareOptions,
} from "./miniflare-options";
import {
	getNodeCompatAliases,
	injectGlobalCode,
	resolveNodeCompatId,
} from "./node-js-compat";
import { resolvePluginConfig } from "./plugin-config";
import { getOutputDirectory, toMiniflareRequest } from "./utils";
import { handleWebSocket } from "./websockets";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type { PluginConfig, ResolvedPluginConfig } from "./plugin-config";
import type { Unstable_RawConfig } from "wrangler";

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin {
	let resolvedPluginConfig: ResolvedPluginConfig;
	let resolvedViteConfig: vite.ResolvedConfig;
	let miniflare: Miniflare | undefined;

	// this flag is used to show the workers configs warning only once
	let workersConfigsWarningShown = false;

	return {
		name: "vite-plugin-cloudflare",
		config(userConfig, env) {
			if (env.isPreview) {
				return { appType: "custom" };
			}

			resolvedPluginConfig = resolvePluginConfig(pluginConfig, userConfig, env);

			if (!workersConfigsWarningShown) {
				workersConfigsWarningShown = true;
				const workersConfigsWarning = getWarningForWorkersConfigs(
					resolvedPluginConfig.rawConfigs
				);
				if (workersConfigsWarning) {
					console.warn(workersConfigsWarning);
				}
			}

			return {
				appType: "custom",
				resolve: {
					alias: getNodeCompatAliases(),
				},
				environments:
					resolvedPluginConfig.type === "workers"
						? {
								...Object.fromEntries(
									Object.entries(resolvedPluginConfig.workers).map(
										([environmentName, workerConfig]) => {
											return [
												environmentName,
												createCloudflareEnvironmentOptions(
													workerConfig,
													userConfig,
													environmentName
												),
											];
										}
									)
								),
								client: {
									build: {
										outDir: getOutputDirectory(userConfig, "client"),
									},
								},
							}
						: undefined,
				builder: {
					async buildApp(builder) {
						const clientEnvironment = builder.environments.client;
						const defaultHtmlPath = path.resolve(
							builder.config.root,
							"index.html"
						);

						if (
							clientEnvironment &&
							(clientEnvironment.config.build.rollupOptions.input ||
								fs.existsSync(defaultHtmlPath))
						) {
							await builder.build(clientEnvironment);
						}

						if (resolvedPluginConfig.type === "workers") {
							const workerEnvironments = Object.keys(
								resolvedPluginConfig.workers
							).map((environmentName) => {
								const environment = builder.environments[environmentName];

								assert(environment, `${environmentName} environment not found`);

								return environment;
							});

							await Promise.all(
								workerEnvironments.map((environment) =>
									builder.build(environment)
								)
							);
						}

						writeDeployConfig(resolvedPluginConfig, resolvedViteConfig);
					},
				},
			};
		},
		configResolved(config) {
			resolvedViteConfig = config;
		},
		async resolveId(source) {
			if (resolvedPluginConfig.type === "assets-only") {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[this.environment.name];
			if (!workerConfig) {
				return;
			}

			return resolveNodeCompatId(this.environment, workerConfig, source);
		},
		async transform(code, id) {
			if (resolvedPluginConfig.type === "assets-only") {
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

			if (resolvedPluginConfig.type === "workers") {
				const workerConfig =
					resolvedPluginConfig.workers[this.environment.name];

				const entryChunk = Object.entries(bundle).find(
					([_, chunk]) => chunk.type === "chunk" && chunk.isEntry
				);

				if (!workerConfig || !entryChunk) {
					return;
				}

				workerConfig.main = entryChunk[0];

				const isEntryWorker =
					this.environment.name ===
					resolvedPluginConfig.entryWorkerEnvironmentName;

				if (isEntryWorker && workerConfig.assets) {
					const workerOutputDirectory = this.environment.config.build.outDir;
					const clientOutputDirectory =
						resolvedViteConfig.environments.client?.build.outDir;

					assert(
						clientOutputDirectory,
						"Unexpected error: client output directory is undefined"
					);

					workerConfig.assets.directory = path.relative(
						path.resolve(resolvedViteConfig.root, workerOutputDirectory),
						path.resolve(resolvedViteConfig.root, clientOutputDirectory)
					);
				}

				config = workerConfig;

				if (workerConfig.configPath) {
					const dotDevDotVarsContent = getDotDevDotVarsContent(
						workerConfig.configPath,
						resolvedPluginConfig.cloudflareEnv
					);
					// Save a .dev.vars file to the worker's build output directory
					// when it exists so that it will be then detected by `vite preview`
					if (dotDevDotVarsContent) {
						this.emitFile({
							type: "asset",
							fileName: ".dev.vars",
							source: dotDevDotVarsContent,
						});
					}
				}
			} else if (this.environment.name === "client") {
				const assetsOnlyConfig = resolvedPluginConfig.config;

				assetsOnlyConfig.assets.directory = ".";

				const filesToAssetsIgnore = ["wrangler.json", ".dev.vars"];

				this.emitFile({
					type: "asset",
					fileName: ".assetsignore",
					source: `${filesToAssetsIgnore.join("\n")}\n`,
				});

				config = assetsOnlyConfig;
			}

			if (!config) {
				return;
			}

			config.no_bundle = true;
			config.rules = [{ type: "ESModule", globs: ["**/*.js"] }];
			// Set to `undefined` if it's an empty object so that the user doesn't see a warning about using `unsafe` fields when deploying their Worker.
			if (config.unsafe && Object.keys(config.unsafe).length === 0) {
				config.unsafe = undefined;
			}

			this.emitFile({
				type: "asset",
				fileName: "wrangler.json",
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
			assert(viteDevServer.httpServer, "Unexpected error: No Vite HTTP server");

			miniflare = new Miniflare(
				getDevMiniflareOptions(resolvedPluginConfig, viteDevServer)
			);

			await initRunners(resolvedPluginConfig, viteDevServer, miniflare);
			const entryWorker = await getDevEntryWorker(
				resolvedPluginConfig,
				miniflare
			);

			const middleware = createMiddleware(({ request }) => {
				return entryWorker.fetch(toMiniflareRequest(request), {
					redirect: "manual",
				}) as any;
			});

			handleWebSocket(
				viteDevServer.httpServer,
				entryWorker.fetch,
				viteDevServer.config.logger
			);

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					middleware(req, res, next);
				});
			};
		},
		configurePreviewServer(vitePreviewServer) {
			const miniflare = new Miniflare(
				getPreviewMiniflareOptions(
					vitePreviewServer,
					pluginConfig.persistState ?? true
				)
			);

			const middleware = createMiddleware(({ request }) => {
				return miniflare.dispatchFetch(toMiniflareRequest(request), {
					redirect: "manual",
				}) as any;
			});

			handleWebSocket(
				vitePreviewServer.httpServer,
				miniflare.dispatchFetch,
				vitePreviewServer.config.logger
			);

			return () => {
				vitePreviewServer.middlewares.use((req, res, next) => {
					middleware(req, res, next);
				});
			};
		},
	};
}

/**
 * Gets the content of a the potential `.dev.vars` target file
 *
 * Note: This resolves the .dev.vars file path following the same logic
 *       as `loadDotEnv` in `/packages/wrangler/src/config/index.ts`
 *       the two need to be kept in sync
 *
 * @param configPath the path to the worker's wrangler config file
 * @param cloudflareEnv the target cloudflare environment
 */
function getDotDevDotVarsContent(
	configPath: string,
	cloudflareEnv: string | undefined
) {
	const configDir = path.dirname(configPath);

	const defaultDotDevDotVarsPath = `${configDir}/.dev.vars`;
	const inputDotDevDotVarsPath = `${defaultDotDevDotVarsPath}${cloudflareEnv ? `.${cloudflareEnv}` : ""}`;

	const targetPath = fs.existsSync(inputDotDevDotVarsPath)
		? inputDotDevDotVarsPath
		: fs.existsSync(defaultDotDevDotVarsPath)
			? defaultDotDevDotVarsPath
			: null;

	if (targetPath) {
		const dotDevDotVarsContent = fs.readFileSync(targetPath);
		return dotDevDotVarsContent;
	}

	return null;
}
