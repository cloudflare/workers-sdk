import { createPlugin } from "../utils";

/**
 * Plugin to forward local testing routes to Miniflare in development.
 */
export const triggerHandlersPlugin = createPlugin("trigger-handlers", (ctx) => {
	return {
		enforce: "pre",
		async configureServer(viteDevServer) {
			const entryWorkerConfig = ctx.entryWorkerConfig;

			if (!entryWorkerConfig) {
				return;
			}

			const [{ CoreHeaders }, { createRequestHandler }] = await Promise.all([
				import("miniflare"),
				import("../request-handler"),
			]);
			const entryWorkerName = entryWorkerConfig.name;
			const requestHandler = createRequestHandler((request) => {
				request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				return ctx.miniflare.dispatchFetch(request, {
					redirect: "manual",
				});
			});

			viteDevServer.middlewares.use("/cdn-cgi/local/", requestHandler);
		},
	};
});
