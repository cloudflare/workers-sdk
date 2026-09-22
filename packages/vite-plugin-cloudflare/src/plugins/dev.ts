import assert from "node:assert";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import { buildPublicUrl, CoreHeaders } from "miniflare";
import colors from "picocolors";
import { initRunners } from "../cloudflare-environment";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "../constants";
import { getDockerPath, prepareContainerImagesForVite } from "../containers";
import { assertIsNotPreview } from "../context";
import {
	compareExportTypes,
	compareWorkerNameToExportTypesMaps,
	getCurrentWorkerNameToExportTypesMap,
} from "../export-types";
import { getDevMiniflareOptions } from "../miniflare-options";
import { UNKNOWN_HOST } from "../shared";
import {
	createPlugin,
	createRequestHandler,
	debuglog,
	satisfiesMinimumViteVersion,
} from "../utils";
import { handleWebSocket } from "../websockets";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";

/**
 * Plugin to provide core development functionality
 */
export const devPlugin = createPlugin("dev", (ctx) => {
	return {
		async configureServer(viteDevServer) {
			assertIsNotPreview(ctx);

			const initialOptions = await getDevMiniflareOptions(ctx, viteDevServer);
			let containerTagToOptionsMap = initialOptions.containerTagToOptionsMap;

			await ctx.startOrUpdateMiniflare(initialOptions.miniflareOptions);

			// Dispose Miniflare when the dev server shuts down. `buildEnd` can't be
			// used for this under `experimental.bundledDev`.
			// Note Vite's `restartServer` calls `server.close()` on every restart, so we skip
			// teardown while restarting.
			const closeServer = viteDevServer.close.bind(viteDevServer);
			viteDevServer.close = async () => {
				try {
					await closeServer();
				} finally {
					if (!ctx.isRestartingDevServer) {
						try {
							await ctx.disposeMiniflare();
						} catch (error) {
							debuglog("Failed to dispose Miniflare instance:", error);
						}
					}
				}
			};

			// Once the HTTP server is listening, update Miniflare's publicUrl with
			// the actual address. This ensures "Cloudflare Stream" preview URLs always reflect
			// the real server URL — even if Vite bumped the port.
			if (viteDevServer.httpServer) {
				viteDevServer.httpServer.on("listening", () => {
					const addr = viteDevServer.httpServer?.address();
					if (typeof addr === "object" && addr !== null) {
						const serverConfig = viteDevServer.config.server;
						ctx.miniflare.publicUrl = buildPublicUrl({
							hostname:
								typeof serverConfig.host === "string"
									? serverConfig.host
									: undefined,
							port: addr.port,
							secure: !!serverConfig.https,
						});
					}
				});
			}

			if (ctx.resolvedPluginConfig.type === "workers") {
				debuglog("Initializing the Vite module runners");
				await initRunners(
					ctx.resolvedPluginConfig,
					viteDevServer,
					ctx.miniflare
				);
				const currentWorkerNameToExportTypesMap =
					await getCurrentWorkerNameToExportTypesMap(
						ctx.resolvedPluginConfig,
						viteDevServer,
						ctx.miniflare
					);
				const hasChanged = compareWorkerNameToExportTypesMaps(
					ctx.workerNameToExportTypesMap,
					currentWorkerNameToExportTypesMap
				);

				if (hasChanged) {
					ctx.setWorkerNameToExportTypesMap(currentWorkerNameToExportTypesMap);
					const updatedOptions = await getDevMiniflareOptions(
						ctx,
						viteDevServer
					);
					containerTagToOptionsMap = updatedOptions.containerTagToOptionsMap;
					await ctx.startOrUpdateMiniflare(updatedOptions.miniflareOptions);
					await initRunners(
						ctx.resolvedPluginConfig,
						viteDevServer,
						ctx.miniflare
					);
				}

				for (const environmentName of ctx.resolvedPluginConfig.environmentNameToWorkerMap.keys()) {
					const environment = viteDevServer.environments[environmentName];
					assert(
						environment,
						`Expected environment "${environmentName}" to be defined`
					);
					environment.hot.on(
						"vite-plugin-cloudflare:worker-export-types",
						async (newExportTypes) => {
							const workerConfig = ctx.getWorkerConfig(environmentName);
							assert(
								workerConfig,
								`Expected workerConfig for environment "${environmentName}" to be defined`
							);
							const oldExportTypes = ctx.workerNameToExportTypesMap.get(
								workerConfig.name
							);
							assert(
								oldExportTypes,
								`Expected export types for Worker "${workerConfig.name}" to be defined`
							);
							const exportTypeHasChanged = compareExportTypes(
								oldExportTypes,
								newExportTypes
							);

							if (exportTypeHasChanged) {
								viteDevServer.config.logger.info(
									colors.dim(
										colors.yellow(
											"Worker exports have changed. Restarting dev server."
										)
									)
								);
								await viteDevServer.restart();
							}
						}
					);
				}

				const entryWorkerConfig = ctx.entryWorkerConfig;
				assert(entryWorkerConfig, `No entry Worker config`);
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

					viteDevServer.middlewares.use(
						async function cloudflarePreMiddleware(req, res, next) {
							assert(req.url, `req.url not defined`);
							// Only the URL pathname is used to match rules
							const request = new Request(new URL(req.url, UNKNOWN_HOST));

							if (req[kRequestType] === "asset") {
								next();
							} else if (excludeRulesMatcher({ request })) {
								req[kRequestType] = "asset";
								next();
							} else if (includeRulesMatcher({ request })) {
								void userWorkerHandler(req, res, next);
							} else {
								next();
							}
						}
					);
				}

				if (containerTagToOptionsMap.size) {
					viteDevServer.config.logger.info(
						colors.dim(
							colors.yellow(
								"∷ Building container images for local development...\n"
							)
						)
					);

					await prepareContainerImagesForVite({
						dockerPath: getDockerPath(),
						containerTagToOptionsMap,
						logger: viteDevServer.config.logger,
					});

					viteDevServer.config.logger.info(
						colors.dim(
							colors.yellow(
								"\n⚡️ Containers successfully built. To rebuild your containers during development, restart the Vite dev server (r + enter)."
							)
						)
					);
				}
			}

			return () => {
				// In Vite 6, pre-middleware is placed before the host check middleware,
				// leaving the server vulnerable to DNS rebinding attacks. We move it to
				// after the host check middleware by re-inserting it before
				// viteCachedTransformMiddleware. In Vite 7+, it's already in the
				// correct position so no action is needed.
				if (!satisfiesMinimumViteVersion("7.0.0")) {
					const middlewareStack = viteDevServer.middlewares.stack;
					const preMiddlewareIndex = middlewareStack.findIndex(
						(middleware) =>
							"name" in middleware.handle &&
							middleware.handle.name === "cloudflarePreMiddleware"
					);

					if (preMiddlewareIndex !== -1) {
						const [preMiddleware] = middlewareStack.splice(
							preMiddlewareIndex,
							1
						);
						assert(
							preMiddleware,
							"Failed to remove cloudflarePreMiddleware from stack"
						);

						const cachedTransformMiddlewareIndex = middlewareStack.findIndex(
							(middleware) =>
								"name" in middleware.handle &&
								middleware.handle.name === "viteCachedTransformMiddleware"
						);
						assert(
							cachedTransformMiddlewareIndex !== -1,
							"Failed to find viteCachedTransformMiddleware"
						);
						middlewareStack.splice(
							cachedTransformMiddlewareIndex,
							0,
							preMiddleware
						);
					}
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
	};
});
