import assert from "node:assert";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { cleanupContainers } from "@cloudflare/containers-shared/src/utils";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import { CoreHeaders } from "miniflare";
import colors from "picocolors";
import * as vite from "vite";
import { initRunners } from "./cloudflare-environment";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "./constants";
import { getDockerPath } from "./containers";
import {
	addDebugToVitePrintUrls,
	DEBUG_PATH,
	getDebugPathHtml,
	getInputInspectorPortOption,
	getResolvedInspectorPort,
} from "./debugging";
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
import { configPlugin } from "./plugins/config";
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
import { createRequestHandler, debuglog } from "./utils";
import { handleWebSocket } from "./websockets";
import type { PluginConfig } from "./plugin-config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";

export type { PluginConfig } from "./plugin-config";

const ctx = new PluginContext();

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin[] {
	ctx.resetLocalState();
	let containerImageTagsSeen = new Set<string>();

	return [
		{
			name: "vite-plugin-cloudflare",
			// This only applies to this plugin so is safe to use while other plugins migrate to the Environment API
			sharedDuringBuild: true,
			config(userConfig, env) {
				ctx.setResolvedPluginConfig(
					resolvePluginConfig(pluginConfig, userConfig, env)
				);
			},
			async configureServer(viteDevServer) {
				assertIsNotPreview(ctx.resolvedPluginConfig);

				// TODO: add inspector back in
				// const inputInspectorPort = await getInputInspectorPortOption(
				// 	ctx.resolvedPluginConfig,
				// 	viteDevServer,
				// 	ctx.miniflare
				// );

				const { miniflareOptions, containerOptions } =
					await getDevMiniflareOptions({
						resolvedPluginConfig: ctx.resolvedPluginConfig,
						viteDevServer,
						// inspectorPort: inputInspectorPort,
						inspectorPort: false,
					});

				await ctx.setMiniflareOptions(miniflareOptions);

				let preMiddleware: vite.Connect.NextHandleFunction | undefined;

				if (ctx.resolvedPluginConfig.type === "workers") {
					const entryWorkerConfig = getEntryWorkerConfig(
						ctx.resolvedPluginConfig
					);
					assert(entryWorkerConfig, `No entry Worker config`);

					debuglog("Initializing the Vite module runners");
					await initRunners(
						ctx.resolvedPluginConfig,
						viteDevServer,
						ctx.miniflare
					);

					const entryWorkerName = entryWorkerConfig.name;

					// The HTTP server is not available in middleware mode
					if (viteDevServer.httpServer) {
						handleWebSocket(
							viteDevServer.httpServer,
							ctx.miniflare,
							entryWorkerName
						);
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
							request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);

							return ctx.miniflare.dispatchFetch(request, {
								redirect: "manual",
							});
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

					if (containerOptions.size > 0) {
						viteDevServer.config.logger.info(
							colors.dim(
								colors.yellow(
									"∷ Building container images for local development...\n"
								)
							)
						);
						await prepareContainerImagesForDev({
							dockerPath: getDockerPath(),
							containerOptions: [...containerOptions.values()],
							onContainerImagePreparationStart: () => {},
							onContainerImagePreparationEnd: () => {},
						});

						containerImageTagsSeen = new Set(containerOptions.keys());
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
							if (containerOptions.size > 0) {
								cleanupContainers(getDockerPath(), containerImageTagsSeen);
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
							if (req[kRequestType] === "asset") {
								request.headers.set(
									CoreHeaders.ROUTE_OVERRIDE,
									ASSET_WORKER_NAME
								);

								return ctx.miniflare.dispatchFetch(request, {
									redirect: "manual",
								});
							} else {
								request.headers.set(
									CoreHeaders.ROUTE_OVERRIDE,
									ROUTER_WORKER_NAME
								);

								return ctx.miniflare.dispatchFetch(request, {
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

				const { miniflareOptions, containerOptions } =
					await getPreviewMiniflareOptions({
						resolvedPluginConfig: ctx.resolvedPluginConfig,
						vitePreviewServer,
						inspectorPort: inputInspectorPort,
					});
				await ctx.setMiniflareOptions(miniflareOptions);

				if (containerOptions.size > 0) {
					const dockerPath = getDockerPath();

					vitePreviewServer.config.logger.info(
						colors.dim(
							colors.yellow(
								"∷ Building container images for local preview...\n"
							)
						)
					);
					await prepareContainerImagesForDev({
						dockerPath: getDockerPath(),
						containerOptions: [...containerOptions.values()],
						onContainerImagePreparationStart: () => {},
						onContainerImagePreparationEnd: () => {},
					});
					containerImageTagsSeen = new Set(containerOptions.keys());

					vitePreviewServer.config.logger.info(
						colors.dim(colors.yellow("\n⚡️ Containers successfully built.\n"))
					);

					process.on("exit", () => {
						if (containerImageTagsSeen.size) {
							cleanupContainers(dockerPath, containerImageTagsSeen);
						}
					});
				}

				handleWebSocket(vitePreviewServer.httpServer, ctx.miniflare);

				// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
				vitePreviewServer.middlewares.use(
					createRequestHandler((request) => {
						return ctx.miniflare.dispatchFetch(request, { redirect: "manual" });
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

				debuglog(
					"buildEnd:",
					ctx.isRestartingDevServer ? "restarted" : "disposing"
				);
				if (!ctx.isRestartingDevServer) {
					try {
						await ctx.disposeMiniflare();
					} catch (error) {
						debuglog("Failed to dispose Miniflare instance:", error);
					}
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
						ctx.miniflare
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
						ctx.miniflare
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
					viteDevServer.middlewares.use(
						"/cdn-cgi/handler/",
						(req, res, next) => {
							const requestHandler = createRequestHandler((request) => {
								// set the target service that handles these requests
								// to point to the User Worker (see `getTargetService` fn in
								// `packages/miniflare/src/workers/core/entry.worker.ts`)
								request.headers.set(
									CoreHeaders.ROUTE_OVERRIDE,
									entryWorkerName
								);
								return ctx.miniflare.dispatchFetch(request, {
									redirect: "manual",
								});
							});

							requestHandler(req, res, next);
						}
					);
				}
			},
		},
		configPlugin(ctx),
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
