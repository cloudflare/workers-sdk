import { CoreHeaders, CorePaths, Request as MiniflareRequest } from "miniflare";
import { createPlugin, createRequestHandler } from "../utils";

/**
 * Plugin to forward `/cdn-cgi/handler/*` routes to trigger handlers in development.
 *
 * Also exposes `/__scheduled` as an alias for `/cdn-cgi/handler/scheduled` so workers
 * built by this plugin honor the same dev-only contract that Wrangler's
 * `--test-scheduled` flag exposes.
 */
export const triggerHandlersPlugin = createPlugin("trigger-handlers", (ctx) => {
	return {
		enforce: "pre",
		async configureServer(viteDevServer) {
			const entryWorkerConfig = ctx.entryWorkerConfig;

			if (!entryWorkerConfig) {
				return;
			}

			const entryWorkerName = entryWorkerConfig.name;
			// [LAW:single-enforcer] `dispatch` is the one place that forwards
			// trigger-handler requests to the worker; both URL boundaries below
			// funnel through it.
			const dispatch = (request: MiniflareRequest) => {
				request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				return ctx.miniflare.dispatchFetch(request, {
					redirect: "manual",
				});
			};

			viteDevServer.middlewares.use(
				"/cdn-cgi/handler/",
				createRequestHandler((request) => dispatch(request))
			);

			// [LAW:dataflow-not-control-flow] `/__scheduled` is a legacy alias for
			// `/cdn-cgi/handler/scheduled`. The variability is the URL value, not
			// whether code runs — rewrite the pathname and reuse the single dispatch
			// path so the scheduled-trigger contract stays in miniflare's entry worker.
			viteDevServer.middlewares.use(
				"/__scheduled",
				createRequestHandler((request) => {
					const aliasedUrl = new URL(request.url);
					aliasedUrl.pathname = CorePaths.SCHEDULED;
					return dispatch(new MiniflareRequest(aliasedUrl, request));
				})
			);
		},
	};
});
