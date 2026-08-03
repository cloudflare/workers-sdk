import { CoreHeaders, Request as MiniflareRequest } from "miniflare";
import { createPlugin, createRequestHandler } from "../utils";

// Miniflare v5 moved its internal endpoints under `/cdn-cgi/local/` (and
// `/__cf_local/` for endpoints that must remain reachable over tunnels). These
// map the pre-v5 paths onto their current equivalents. This must stay in sync
// with `rewriteLegacyMiniflarePath()` in Wrangler's ProxyWorker.
const LEGACY_PATH_REWRITES: readonly [string, string][] = [
	["/cdn-cgi/handler", "/cdn-cgi/local"],
	["/cdn-cgi/mf/scheduled", "/cdn-cgi/local/scheduled"],
	["/cdn-cgi/mf/stream", "/__cf_local/stream"],
	["/cdn-cgi/mf/imagedelivery", "/__cf_local/imagedelivery"],
	["/cdn-cgi/explorer", "/cdn-cgi/local/explorer"],
];

export function rewriteLegacyMiniflarePath(pathname: string): string {
	for (const [oldPrefix, newPrefix] of LEGACY_PATH_REWRITES) {
		if (pathname === oldPrefix || pathname.startsWith(`${oldPrefix}/`)) {
			return newPrefix + pathname.slice(oldPrefix.length);
		}
	}
	return pathname;
}

/**
 * Plugin to forward trigger handler routes (scheduled, email) and other
 * internal Miniflare endpoints to Miniflare in development, including
 * backwards-compatible rewrites for pre-v5 paths.
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

			function dispatch(request: MiniflareRequest) {
				request.headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				return ctx.miniflare.dispatchFetch(request, {
					redirect: "manual",
				});
			}

			// Canonical paths: forward directly to Miniflare.
			viteDevServer.middlewares.use(
				"/cdn-cgi/local/",
				createRequestHandler((request) => dispatch(request))
			);

			// Backwards compatibility: rewrite legacy paths onto their canonical
			// equivalents before dispatching.
			for (const [oldPrefix, newPrefix] of LEGACY_PATH_REWRITES) {
				viteDevServer.middlewares.use(
					oldPrefix,
					createRequestHandler((request) => {
						const url = new URL(request.url);
						url.pathname = newPrefix + url.pathname.slice(oldPrefix.length);
						return dispatch(new MiniflareRequest(url, request));
					})
				);
			}
		},
	};
});
