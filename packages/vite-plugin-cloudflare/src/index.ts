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
	MAIN_ENTRY_NAME,
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
import { writeDeployConfig } from "./deploy-config";
import {
	getLocalDevVarsForPreview,
	hasLocalDevVarsFileChanged,
} from "./dev-vars";
import {
	getDevMiniflareOptions,
	getEntryWorkerConfig,
	getPreviewMiniflareOptions,
} from "./miniflare-options";
import { getAssetsDirectory } from "./output-config";
import {
	assertIsNotPreview,
	assertIsPreview,
	resolvePluginConfig,
} from "./plugin-config";
import { additionalModules } from "./plugins/additional-modules";
import {
	nodeJsAls,
	nodeJsCompat,
	nodeJsCompatWarnings,
} from "./plugins/nodejs-compat";
import {
	virtualClientFallback,
	virtualModules,
} from "./plugins/virtual-modules";
import { wasmHelper } from "./plugins/wasm";
import { UNKNOWN_HOST } from "./shared";
import { createRequestHandler, getOutputDirectory } from "./utils";
import { validateWorkerEnvironmentOptions } from "./vite-config";
import { handleWebSocket } from "./websockets";
import { getWarningForWorkersConfigs } from "./workers-configs";
import type { Context } from "./context";
import type { PluginConfig, ResolvedPluginConfig } from "./plugin-config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { Unstable_RawConfig } from "wrangler";

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
	let resolvedPluginConfig: ResolvedPluginConfig;
	let resolvedViteConfig: vite.ResolvedConfig;
	let containerImageTagsSeen = new Set<string>();
	/** Used to track whether hooks are being called because of a server restart or a server close event. */
	let restartingServer = false;

	/**
	 * Returns the Worker config for the given environment if it is a Worker environment
	 */
	function getWorkerConfig(environmentName: string) {
		return resolvedPluginConfig.type === "workers"
			? resolvedPluginConfig.workers[environmentName]
			: undefined;
	}

	/**
	 * Returns the `NodeJsCompat` instance for the given environment if it has `nodejs_compat` enabled
	 */
	function getNodeJsCompat(environmentName: string) {
		return resolvedPluginConfig.type === "workers"
			? resolvedPluginConfig.nodeJsCompatMap.get(environmentName)
			: undefined;
	}

	const ctx: Context = { getWorkerConfig, getNodeJsCompat };

	return [
		{
			name: "vite-plugin-cloudflare",
			// This only applies to this plugin so is safe to use while other plugins migrate to the Environment API
			sharedDuringBuild: true,
			// Vite `config` Hook
			// see https://vite.dev/guide/api-plugin.html#config
			config(userConfig, env) {
				resolvedPluginConfig = resolvePluginConfig(
					pluginConfig,
					userConfig,
					env
				);

				if (resolvedPluginConfig.type === "preview") {
					return { appType: "custom" };
				}

				if (!workersConfigsWarningShown) {
					workersConfigsWarningShown = true;
					const workersConfigsWarning = getWarningForWorkersConfigs(
						resolvedPluginConfig.rawConfigs
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
						resolvedPluginConfig.type === "workers"
							? {
									...Object.fromEntries(
										Object.entries(resolvedPluginConfig.workers).map(
											([environmentName, workerConfig]) => {
												return [
													environmentName,
													createCloudflareEnvironmentOptions({
														workerConfig,
														userConfig,
														mode: env.mode,
														environmentName,
														isEntryWorker:
															resolvedPluginConfig.type === "workers" &&
															environmentName ===
																resolvedPluginConfig.entryWorkerEnvironmentName,
														hasNodeJsCompat:
															getNodeJsCompat(environmentName) !== undefined,
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
							createBuildApp(resolvedPluginConfig),
					},
				};
			},
			// Vite `configResolved` Hook
			// see https://vite.dev/guide/api-plugin.html#configresolved
			configResolved(config) {
				resolvedViteConfig = config;

				if (resolvedPluginConfig.type === "workers") {
					validateWorkerEnvironmentOptions(
						resolvedPluginConfig,
						resolvedViteConfig
					);
				}
			},
			buildStart() {
				// This resets the value when the dev server restarts
				workersConfigsWarningShown = false;
			},
			generateBundle(_, bundle) {
				assertIsNotPreview(resolvedPluginConfig);

				let outputConfig: Unstable_RawConfig | undefined;

				if (resolvedPluginConfig.type === "workers") {
					const inputConfig =
						resolvedPluginConfig.workers[this.environment.name];

					if (!inputConfig) {
						return;
					}

					const entryChunk = Object.values(bundle).find(
						(chunk) =>
							chunk.type === "chunk" &&
							chunk.isEntry &&
							chunk.name === MAIN_ENTRY_NAME
					);

					assert(
						entryChunk,
						`Expected entry chunk with name "${MAIN_ENTRY_NAME}"`
					);

					const isEntryWorker =
						this.environment.name ===
						resolvedPluginConfig.entryWorkerEnvironmentName;

					outputConfig = {
						...inputConfig,
						main: entryChunk.fileName,
						no_bundle: true,
						rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
						assets: isEntryWorker
							? {
									...inputConfig.assets,
									directory: getAssetsDirectory(
										this.environment.config.build.outDir,
										resolvedViteConfig
									),
								}
							: undefined,
					};

					if (inputConfig.configPath) {
						const localDevVars = getLocalDevVarsForPreview(
							inputConfig.configPath,
							resolvedPluginConfig.cloudflareEnv
						);
						// Save a .dev.vars file to the worker's build output directory if there are local dev vars, so that it will be then detected by `vite preview`.
						if (localDevVars) {
							this.emitFile({
								type: "asset",
								fileName: ".dev.vars",
								source: localDevVars,
							});
						}
					}
				} else if (this.environment.name === "client") {
					const inputConfig = resolvedPluginConfig.config;

					outputConfig = {
						...inputConfig,
						assets: {
							...inputConfig.assets,
							directory: ".",
						},
					};

					const filesToAssetsIgnore = ["wrangler.json", ".dev.vars"];

					this.emitFile({
						type: "asset",
						fileName: ".assetsignore",
						source: `${filesToAssetsIgnore.join("\n")}\n`,
					});
				}

				if (!outputConfig) {
					return;
				}

				// Set to `undefined` if it's an empty object so that the user doesn't see a warning about using `unsafe` fields when deploying their Worker.
				if (
					outputConfig.unsafe &&
					Object.keys(outputConfig.unsafe).length === 0
				) {
					outputConfig.unsafe = undefined;
				}

				this.emitFile({
					type: "asset",
					fileName: "wrangler.json",
					source: JSON.stringify(outputConfig),
				});
			},
			writeBundle() {
				assertIsNotPreview(resolvedPluginConfig);

				// These conditions ensure the deploy config is emitted once per application build as `writeBundle` is called for each environment.
				// If Vite introduces an additional hook that runs after the application has built then we could use that instead.
				if (
					this.environment.name ===
					(resolvedPluginConfig.type === "workers"
						? resolvedPluginConfig.entryWorkerEnvironmentName
						: "client")
				) {
					writeDeployConfig(resolvedPluginConfig, resolvedViteConfig);
				}
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

				assertIsNotPreview(resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					resolvedPluginConfig,
					viteDevServer,
					miniflare
				);

				const configChangedHandler = async (changedFilePath: string) => {
					assertIsNotPreview(resolvedPluginConfig);

					if (
						resolvedPluginConfig.configPaths.has(changedFilePath) ||
						hasLocalDevVarsFileChanged(resolvedPluginConfig, changedFilePath) ||
						hasAssetsConfigChanged(
							resolvedPluginConfig,
							resolvedViteConfig,
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
				const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);
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
					resolvedPluginConfig,
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

				if (resolvedPluginConfig.type === "workers") {
					assert(entryWorkerConfig, `No entry Worker config`);

					debuglog("Initializing the Vite module runners");
					await initRunners(resolvedPluginConfig, viteDevServer, miniflare);

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
							: resolvedPluginConfig.staticRouting;

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
				assertIsPreview(resolvedPluginConfig);

				const inputInspectorPort = await getInputInspectorPortOption(
					resolvedPluginConfig,
					vitePreviewServer
				);

				// first Worker in the Array is always the entry Worker
				const entryWorkerConfig = resolvedPluginConfig.workers[0];
				const hasDevContainers =
					entryWorkerConfig?.containers?.length &&
					entryWorkerConfig.dev.enable_containers;
				let containerBuildId: string | undefined;

				if (hasDevContainers) {
					containerBuildId = generateContainerBuildId();
				}

				miniflare = new Miniflare(
					await getPreviewMiniflareOptions({
						resolvedPluginConfig,
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
					resolvedViteConfig.command === "serve" &&
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
				assertIsNotPreview(resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;

				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					resolvedPluginConfig.type === "workers" &&
					pluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(viteDevServer);
				}

				const workerNames =
					resolvedPluginConfig.type === "workers"
						? Object.values(resolvedPluginConfig.workers).map(
								(worker) => worker.name
							)
						: [];

				viteDevServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						resolvedPluginConfig,
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
				assertIsPreview(resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;
				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					resolvedPluginConfig.workers.length >= 1 &&
					resolvedPluginConfig.inspectorPort !== false
				) {
					addDebugToVitePrintUrls(vitePreviewServer);
				}

				const workerNames = resolvedPluginConfig.workers.map((worker) => {
					assert(worker.name, "Expected the Worker to have a name");
					return worker.name;
				});

				vitePreviewServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
					const resolvedInspectorPort = await getResolvedInspectorPort(
						resolvedPluginConfig,
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
				assertIsNotPreview(resolvedPluginConfig);

				if (resolvedPluginConfig.type === "workers") {
					const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);
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

						// `req.url` is the URL of the request relative to the middleware
						// mount path. Here we ensure that miniflare receives a request that
						// reflects the original request url
						req.url = req.originalUrl;
						requestHandler(req, res, next);
					});
				}
			},
		},
		virtualModules(ctx),
		virtualClientFallback(),
		wasmHelper(ctx),
		additionalModules(ctx),
		nodeJsAls(ctx),
		nodeJsCompat(ctx),
		nodeJsCompatWarnings(ctx),
	];
}
