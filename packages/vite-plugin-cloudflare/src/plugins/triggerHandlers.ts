import { CoreHeaders } from "miniflare";
import { createRequestHandler, getEntryWorkerConfig } from "../utils";
import { createPlugin } from "./utils";

/**
 * Plugin to forward `/cdn-cgi/handler/*` routes to trigger handlers in development.
 */
export const triggerHandlersPlugin = createPlugin("trigger-handlers", (ctx) => {
	return {
		enforce: "pre",
		async configureServer(viteDevServer) {
			const entryWorkerConfig = getEntryWorkerConfig(ctx.resolvedPluginConfig);

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

			viteDevServer.middlewares.use("/cdn-cgi/handler/", requestHandler);
		},
	};
});
