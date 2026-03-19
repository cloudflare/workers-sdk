import assert from "node:assert";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { cleanupContainers } from "@cloudflare/containers-shared/src/utils";
import { generateStaticRoutingRuleMatcher } from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
import { CoreHeaders } from "miniflare";
import colors from "picocolors";
import { initRunners } from "../cloudflare-environment";
import {
	ASSET_WORKER_NAME,
	kRequestType,
	ROUTER_WORKER_NAME,
} from "../constants";
import { getDockerPath } from "../containers";
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

let exitCallback = () => {};

process.on("exit", () => {
	exitCallback();
});

/**
 * Plugin to provide core development functionality
 */
export const devPlugin = createPlugin("dev", (ctx) => {
	let containerImageTags = new Set<string>();

	return {
		async buildEnd() {
			if (
				ctx.resolvedViteConfig.command === "serve" &&
				containerImageTags.size
			) {
				const dockerPath = getDockerPath();
				cleanupContainers(dockerPath, containerImageTags);
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
		async configureServer(viteDevServer) {
			assertIsNotPreview(ctx);

			const initialOptions = await getDevMiniflareOptions(ctx, viteDevServer);
			let containerTagToOptionsMap = initialOptions.containerTagToOptionsMap;

			await ctx.startOrUpdateMiniflare(initialOptions.miniflareOptions);

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

					await prepareContainerImagesForDev({
						dockerPath: getDockerPath(),
						containerOptions: [...containerTagToOptionsMap.values()],
						onContainerImagePreparationStart: () => {},
						onContainerImagePreparationEnd: () => {},
						logger: viteDevServer.config.logger,
						isVite: true,
					});

					containerImageTags = new Set(containerTagToOptionsMap.keys());
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
					exitCallback = () => {
						if (containerImageTags.size) {
							cleanupContainers(getDockerPath(), containerImageTags);
						}
					};
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
