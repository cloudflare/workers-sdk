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
import {
	getDevMiniflareOptions,
	getEntryWorkerConfig,
} from "../miniflare-options";
import { assertIsNotPreview } from "../plugin-config";
import { UNKNOWN_HOST } from "../shared";
import { createRequestHandler, debuglog } from "../utils";
import { handleWebSocket } from "../websockets";
import { createPlugin } from "./utils";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type * as vite from "vite";

export const devPlugin = createPlugin("dev", (ctx) => {
	let containerImageTagsSeen = new Set<string>();

	return {
		async configureServer(viteDevServer) {
			assertIsNotPreview(ctx.resolvedPluginConfig);

			// TODO: add inspector back in
			// const inputInspectorPort = await getInputInspectorPortOption(
			// 	ctx.resolvedPluginConfig,
			// 	viteDevServer,
			// 	ctx.miniflare
			// );

			const { miniflareOptions, containerTagToOptionsMap } =
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

				if (containerTagToOptionsMap.size > 0) {
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
					});

					containerImageTagsSeen = new Set(containerTagToOptionsMap.keys());
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
						if (containerTagToOptionsMap.size > 0) {
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
	};
});
