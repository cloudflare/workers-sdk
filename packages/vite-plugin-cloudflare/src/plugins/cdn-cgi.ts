import { CoreHeaders } from "miniflare";
import { createPlugin, createRequestHandler } from "../utils";

/**
 * Plugin to forward `/cdn-cgi/` routes to Miniflare in development
 * We handle specified routes rather than using a catch all so that users can add their own routes using Vite's proxy functionality
 */
export const cdnCgiPlugin = createPlugin("cdn-cgi", (ctx) => {
	return {
		enforce: "pre",
		async configureServer(viteDevServer) {
			const entryWorkerConfig = ctx.entryWorkerConfig;

			if (!entryWorkerConfig) {
				return;
			}

			const entryWorkerName = entryWorkerConfig.name;
			const requestHandler = createRequestHandler((request) => {
				request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				return ctx.miniflare.dispatchFetch(request, {
					redirect: "manual",
				});
			});

			viteDevServer.middlewares.use(async (req, res, next) => {
				const url = req.originalUrl ?? "";

				const isLocalExplorer =
					url === "/cdn-cgi/explorer" ||
					url.startsWith("/cdn-cgi/explorer/") ||
					url.startsWith("/cdn-cgi/explorer?");
				const isTriggerHandler = url.startsWith("/cdn-cgi/handler/");

				if (isLocalExplorer || isTriggerHandler) {
					await requestHandler(req, res, next);
				} else {
					next();
				}
			});
		},
	};
});
