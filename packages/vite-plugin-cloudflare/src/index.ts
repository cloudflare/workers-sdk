import assert from "node:assert";
import * as util from "node:util";
import {
	cleanupContainers,
	generateContainerBuildId,
	resolveDockerHost,
} from "@cloudflare/containers-shared/src/utils";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import { CoreHeaders, Miniflare } from "miniflare";
import colors from "picocolors";
import * as vite from "vite";
import { hasAssetsConfigChanged } from "./asset-config";
import { createBuildApp } from "./build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
	initRunners,
} from "./cloudflare-environment";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "./constants";
import { getDockerPath, prepareContainerImages } from "./containers";
import {
	addDebugToVitePrintUrls,
	DEBUG_PATH,
	getDebugPathHtml,
	getInputInspectorPortOption,
	getResolvedInspectorPort,
} from "./debugging";
import { hasLocalDevVarsFileChanged } from "./dev-vars";
import {
	getDevMiniflareOptions,
	getEntryWorkerConfig,
	getPreviewMiniflareOptions,
} from "./miniflare-options";
import {
	assertIsNotPreview,
	assertIsPreview,
	resolvePluginConfig,
} from "./plugin-config";
import { additionalModulesPlugin } from "./plugins/additional-modules";
import {
	nodeJsAlsPlugin,
	nodeJsCompatPlugin,
	nodeJsCompatWarningsPlugin,
} from "./plugins/nodejs-compat";
import { outputConfigPlugin } from "./plugins/output-config";
import { PluginContext } from "./plugins/utils";
import {
	virtualClientFallbackPlugin,
	virtualModulesPlugin,
} from "./plugins/virtual-modules";
import { wasmHelperPlugin } from "./plugins/wasm";
import { UNKNOWN_HOST } from "./shared";
import { createRequestHandler, getOutputDirectory } from "./utils";
import { validateWorkerEnvironmentOptions } from "./vite-config";
import { handleWebSocket } from "./websockets";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type { PluginConfig } from "./plugin-config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";

export type { PluginConfig } from "./plugin-config";

const debuglog = util.debuglog("@cloudflare:vite-plugin");

// this flag is used to show the workers configs warning only once
let workersConfigsWarningShown = false;
let miniflare: Miniflare | undefined;

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin[] {
	const ctx = new PluginContext();
	let containerImageTagsSeen = new Set<string>();
	/** Used to track whether hooks are being called because of a server restart or a server close event. */
	let restartingServer = false;

	return [
		{
			name: "vite-plugin-cloudflare",
			// This only applies to this plugin so is safe to use while other plugins migrate to the Environment API
			sharedDuringBuild: true,
			// Vite `config` Hook
			// see https://vite.dev/guide/api-plugin.html#config
			config(userConfig, env) {
				ctx.setResolvedPluginConfig(
					resolvePluginConfig(pluginConfig, userConfig, env)
				);

				if (ctx.resolvedPluginConfig.type === "preview") {
					return { appType: "custom" };
				}

				if (!workersConfigsWarningShown) {
					workersConfigsWarningShown = true;
					const workersConfigsWarning = getWarningForWorkersConfigs(
						ctx.resolvedPluginConfig.rawConfigs
					);
					if (workersConfigsWarning) {
						console.warn(workersConfigsWarning);
					}
				}

				const defaultDeniedFiles = [
					".env",
					".env.*",
					"*.{crt,pem}",
					"**/.git/**",
				];

				return {
					appType: "custom",
					server: {
						fs: {
							deny: [...defaultDeniedFiles, ".dev.vars", ".dev.vars.*"],
						},
					},
					environments:
						ctx.resolvedPluginConfig.type === "workers"
							? {
									...Object.fromEntries(
										Object.entries(ctx.resolvedPluginConfig.workers).map(
											([environmentName, workerConfig]) => {
												return [
													environmentName,
													createCloudflareEnvironmentOptions({
														workerConfig,
														userConfig,
														mode: env.mode,
														environmentName,
														isEntryWorker:
															ctx.resolvedPluginConfig.type === "workers" &&
															environmentName ===
																ctx.resolvedPluginConfig
																	.entryWorkerEnvironmentName,
														hasNodeJsCompat:
															ctx.getNodeJsCompat(environmentName) !==
															undefined,
													}),
												];
											}
										)
									),
									client: {
										build: {
											outDir: getOutputDirectory(userConfig, "client"),
										},
										optimizeDeps: {
											// Some frameworks allow users to mix client and server code in the same file and then extract the server code.
											// As the dependency optimization may happen before the server code is extracted, we should exclude Cloudflare built-ins from client optimization.
											exclude: [...cloudflareBuiltInModules],
										},
									},
								}
							: undefined,
					builder: {
						buildApp:
							userConfig.builder?.buildApp ??
							createBuildApp(ctx.resolvedPluginConfig),
					},
				};
			},
			// Vite `configResolved` Hook
			// see https://vite.dev/guide/api-plugin.html#configresolved
			configResolved(resolvedViteConfig) {
				ctx.setResolvedViteConfig(resolvedViteConfig);

				if (ctx.resolvedPluginConfig.type === "workers") {
					validateWorkerEnvironmentOptions(
						ctx.resolvedPluginConfig,
						ctx.resolvedViteConfig
					);
				}
			},
			buildStart() {
				// This resets the value when the dev server restarts
				workersConfigsWarningShown = false;
			},
			// Vite `configureServer` Hook
			// see https://vite.dev/guide/api-plugin.html#configureserver
			async configureServer(viteDevServer) {
				// Patch the `server.restart` method to track whether the server is restarting or not.
				const restartServer = viteDevServer.restart.bind(viteDevServer);
				viteDevServer.restart = async () => {
					try {
						restartingServer = true;
						debuglog("From server.restart(): Restarting server...");
						await restartServer();
						debuglog("From server.restart(): Restarted server...");
					} finally {
						restartingServer = false;
					}
				};

				assertIsNotPreview(ctx.resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					ctx.resolvedPluginConfig,
					viteDevServer,
					miniflare
				);

				const configChangedHandler = async (changedFilePath: string) => {
					assertIsNotPreview(ctx.resolvedPluginConfig);

					if (
						ctx.resolvedPluginConfig.configPaths.has(changedFilePath) ||
						hasLocalDevVarsFileChanged(
							ctx.resolvedPluginConfig,
							changedFilePath
						) ||
						hasAssetsConfigChanged(
							ctx.resolvedPluginConfig,
							ctx.resolvedViteConfig,
							changedFilePath
						)
					) {
						debuglog("Config changed: " + changedFilePath);
						viteDevServer.watcher.off("change", configChangedHandler);
						debuglog("Restarting dev server and aborting previous setup");
						await viteDevServer.restart();
					}
				};
				viteDevServer.watcher.on("change", configChangedHandler);

				let containerBuildId: string | undefined;
				const entryWorkerConfig = getEntryWorkerConfig(
					ctx.resolvedPluginConfig
				);
				const hasDevContainers =
					entryWorkerConfig?.containers?.length &&
					entryWorkerConfig.dev.enable_containers;
				const dockerPath = getDockerPath();

				if (hasDevContainers) {
					containerBuildId = generateContainerBuildId();
					entryWorkerConfig.dev.container_engine =
						resolveDockerHost(dockerPath);
				}

				const miniflareDevOptions = await getDevMiniflareOptions({
					resolvedPluginConfig: ctx.resolvedPluginConfig,
					viteDevServer,
					inspectorPort: inputInspectorPort,
					containerBuildId,
				});

				if (!miniflare) {
					debuglog("Creating new Miniflare instance");
					miniflare = new Miniflare(miniflareDevOptions);
				} else {
					debuglog("Updating the existing Miniflare instance");
					await miniflare.setOptions(miniflareDevOptions);
					debuglog("Miniflare is ready");
				}

				let preMiddleware: vite.Connect.NextHandleFunction | undefined;

				if (ctx.resolvedPluginConfig.type === "workers") {
					assert(entryWorkerConfig, `No entry Worker config`);

					debuglog("Initializing the Vite module runners");
					await initRunners(ctx.resolvedPluginConfig, viteDevServer, miniflare);

					const entryWorkerName = entryWorkerConfig.name;

					// The HTTP server is not available in middleware mode
					if (viteDevServer.httpServer) {
						handleWebSocket(viteDevServer.httpServer, async () => {
							assert(miniflare, `Miniflare not defined`);
							const entryWorker = await miniflare.getWorker(entryWorkerName);

							return entryWorker.fetch;
						});
					}

					const staticRouting: StaticRouting | undefined =
						entryWorkerConfig.assets?.run_worker_first === true
							? { user_worker: ["/*"] }
							: ctx.resolvedPluginConfig.staticRouting;

					if (staticRouting) {
						const excludeRulesMatcher = generateStaticRoutingRuleMatcher(
							staticRouting.asset_worker ?? []
						);
						const includeRulesMatcher = generateStaticRoutingRuleMatcher(
							staticRouting.user_worker
						);
						const userWorkerHandler = createRequestHandler(async (request) => {
							assert(miniflare, `Miniflare not defined`);
							const userWorker = await miniflare.getWorker(entryWorkerName);

							return userWorker.fetch(request, { redirect: "manual" });
						});

						preMiddleware = async (req, res, next) => {
							assert(req.url, `req.url not defined`);
							// Only the URL pathname is used to match rules
							const request = new Request(new URL(req.url, UNKNOWN_HOST));

							if (req[kRequestType] === "asset") {
								next();
							} else if (excludeRulesMatcher({ request })) {
								req[kRequestType] === "asset";
								next();
							} else if (includeRulesMatcher({ request })) {
								userWorkerHandler(req, res, next);
							} else {
								next();
							}
						};
					}

					if (hasDevContainers) {
						viteDevServer.config.logger.info(
							colors.dim(
								colors.yellow(
									"∷ Building container images for local development...\n"
								)
							)
						);
						containerImageTagsSeen = await prepareContainerImages({
							containersConfig: entryWorkerConfig.containers,
							containerBuildId,
							isContainersEnabled: entryWorkerConfig.dev.enable_containers,
							dockerPath,
							configPath: entryWorkerConfig.configPath,
						});
						viteDevServer.config.logger.info(
							colors.dim(
								colors.yellow(
									"\n⚡️ Containers successfully built. To rebuild your containers during development, restart the Vite dev server (r + enter)."
								)
							)
						);

						/*
						 * Upon exiting the dev process we should ensure we perform any
						 * containers-specific cleanup work. Vite recommends using the
						 * `buildEnd` and `closeBundle` hooks, which are called when the
						 * server is closed. Unfortunately none of these hooks work if the
						 * process exits forcefully, via `ctrl+C`, and Vite provides no
						 * other alternatives. For this reason we decided to hook into both
						 * `buildEnd` and the `exit` event, and ensure we always cleanup
						 * (please note that handling the `beforeExit` event, which does
						 * support async ops, is not an option, since Vite calls
						 * `process.exit()` imperatively, and therefore causes `beforeExit`
						 * not to be emitted).
						 *
						 */
						process.on("exit", async () => {
							if (containerImageTagsSeen.size) {
								cleanupContainers(dockerPath, containerImageTagsSeen);
							}
						});
					}
				}

				return () => {
					if (preMiddleware) {
						const middlewareStack = viteDevServer.middlewares.stack;
						const cachedTransformMiddlewareIndex = middlewareStack.findIndex(
							(middleware) =>
								"name" in middleware.handle &&
								middleware.handle.name === "viteCachedTransformMiddleware"
						);
						assert(
							cachedTransformMiddlewareIndex !== -1,
							"Failed to find viteCachedTransformMiddleware"
						);

						// Insert our middleware after the host check middleware to prevent DNS rebinding attacks
						middlewareStack.splice(cachedTransformMiddlewareIndex, 0, {
							route: "",
							handle: preMiddleware,
						});
					}

					// post middleware
					viteDevServer.middlewares.use(
						createRequestHandler(async (request, req) => {
							assert(miniflare, `Miniflare not defined`);

							if (req[kRequestType] === "asset") {
								const assetWorker =
									await miniflare.getWorker(ASSET_WORKER_NAME);

								return assetWorker.fetch(request, { redirect: "manual" });
							} else {
								const routerWorker =
									await miniflare.getWorker(ROUTER_WORKER_NAME);

								return routerWorker.fetch(request, {
									redirect: "manual",
								});
							}
						})
					);
				};
			},
			// Vite `configurePreviewServer` Hook
			// see https://vite.dev/guide/api-plugin.html#configurepreviewserver
			async configurePreviewServer(vitePreviewServer) {
				assertIsPreview(ctx.resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					ctx.resolvedPluginConfig,
					vitePreviewServer
				);

				// first Worker in the Array is always the entry Worker
				const entryWorkerConfig = ctx.resolvedPluginConfig.workers[0];
				const hasDevContainers =
					entryWorkerConfig?.containers?.length &&
					entryWorkerConfig.dev.enable_containers;
				let containerBuildId: string | undefined;

				if (hasDevContainers) {
					containerBuildId = generateContainerBuildId();
				}

				miniflare = new Miniflare(
					await getPreviewMiniflareOptions({
						resolvedPluginConfig: ctx.resolvedPluginConfig,
						vitePreviewServer,
						inspectorPort: inputInspectorPort,
						containerBuildId,
					})
				);

				if (hasDevContainers) {
					const dockerPath = getDockerPath();

					vitePreviewServer.config.logger.info(
						colors.dim(
							colors.yellow(
								"∷ Building container images for local preview...\n"
							)
						)
					);
					containerImageTagsSeen = await prepareContainerImages({
						containersConfig: entryWorkerConfig.containers,
						containerBuildId,
						isContainersEnabled: entryWorkerConfig.dev.enable_containers,
						dockerPath,
						configPath: entryWorkerConfig.configPath,
					});
					vitePreviewServer.config.logger.info(
						colors.dim(colors.yellow("\n⚡️ Containers successfully built.\n"))
					);

					process.on("exit", () => {
						if (containerImageTagsSeen.size) {
							cleanupContainers(dockerPath, containerImageTagsSeen);
						}
					});
				}

				handleWebSocket(vitePreviewServer.httpServer, () => {
					assert(miniflare, `Miniflare not defined`);

					return miniflare.dispatchFetch;
				});

				// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
				vitePreviewServer.middlewares.use(
					createRequestHandler((request) => {
						assert(miniflare, `Miniflare not defined`);

						return miniflare.dispatchFetch(request, { redirect: "manual" });
					})
				);
			},
			async buildEnd() {
				if (
					ctx.resolvedViteConfig.command === "serve" &&
					containerImageTagsSeen?.size
				) {
					const dockerPath = getDockerPath();
					cleanupContainers(dockerPath, containerImageTagsSeen);
				}

				debuglog("buildEnd:", restartingServer ? "restarted" : "disposing");
				if (!restartingServer) {
					debuglog("buildEnd: disposing Miniflare instance");
					await miniflare?.dispose().catch((error) => {
						debuglog("buildEnd: failed to dispose Miniflare instance:", error);
					});
					miniflare = undefined;
				}
			},
		},
		// Plugin that provides a `__debug` path for debugging the Workers
		{
			name: "vite-plugin-cloudflare:debug",
			enforce: "pre",
			configureServer(viteDevServer) {
				assertIsNotPreview(ctx.resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;

				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					ctx.resolvedPluginConfig.type === "workers" &&
					pluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(viteDevServer);
				}

				const workerNames =
					ctx.resolvedPluginConfig.type === "workers"
						? Object.values(ctx.resolvedPluginConfig.workers).map(
								(worker) => worker.name
							)
						: [];

				viteDevServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						ctx.resolvedPluginConfig,
						miniflare
					);

					if (resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						res.end(html);
					} else {
						next();
					}
				});
			},
			async configurePreviewServer(vitePreviewServer) {
				assertIsPreview(ctx.resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;
				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					ctx.resolvedPluginConfig.workers.length >= 1 &&
					ctx.resolvedPluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(vitePreviewServer);
				}

				const workerNames = ctx.resolvedPluginConfig.workers.map((worker) => {
					assert(worker.name, "Expected the Worker to have a name");
					return worker.name;
				});

				vitePreviewServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						ctx.resolvedPluginConfig,
						miniflare
					);

					if (resolvedInspectorPort) {
						const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
						res.setHeader("Content-Type", "text/html");
						res.end(html);
					} else {
						next();
					}
				});
			},
		},
		// Plugin to handle cron/email/etc triggers
		{
			name: "vite-plugin-cloudflare:trigger-handlers",
			enforce: "pre",
			async configureServer(viteDevServer) {
				assertIsNotPreview(ctx.resolvedPluginConfig);

				if (ctx.resolvedPluginConfig.type === "workers") {
					const entryWorkerConfig = getEntryWorkerConfig(
						ctx.resolvedPluginConfig
					);
					assert(entryWorkerConfig, `No entry Worker config`);

					const entryWorkerName = entryWorkerConfig.name;

					// cron && email triggers
					viteDevServer.middlewares.use("/cdn-cgi/", (req, res, next) => {
						const requestHandler = createRequestHandler((request) => {
							assert(miniflare, `Miniflare not defined`);

							// set the target service that handles these requests
							// to point to the User Worker (see `getTargetService` fn in
							// `packages/miniflare/src/workers/core/entry.worker.ts`)
							request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
							return miniflare.dispatchFetch(request, { redirect: "manual" });
						});

						requestHandler(req, res, next);
					});
				}
			},
		},
		virtualModulesPlugin(ctx),
		virtualClientFallbackPlugin(ctx),
		outputConfigPlugin(ctx),
		wasmHelperPlugin(ctx),
		additionalModulesPlugin(ctx),
		nodeJsAlsPlugin(ctx),
		nodeJsCompatPlugin(ctx),
		nodeJsCompatWarningsPlugin(ctx),
	];
}
