import { buildPublicUrl, Request as MiniflareRequest } from "miniflare";
import { assertIsPreview } from "../context";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import { createPlugin, createRequestHandler } from "../utils";
import { handleWebSocket } from "../websockets";
import { rewriteLegacyMiniflarePath } from "./trigger-handlers";

/**
 * Plugin to provide core preview functionality
 */
export const previewPlugin = createPlugin("preview", (ctx) => {
	return {
		async configurePreviewServer(vitePreviewServer) {
			assertIsPreview(ctx);

			// Ensure Miniflare is disposed when the preview server is closed during prerendering
			const closePreviewServer =
				vitePreviewServer.close.bind(vitePreviewServer);
			vitePreviewServer.close = async () => {
				await Promise.all([ctx.disposeMiniflare(), closePreviewServer()]);
			};

			const miniflareOptions = await getPreviewMiniflareOptions(
				ctx,
				vitePreviewServer
			);
			await ctx.startOrUpdateMiniflare(miniflareOptions);

			// Once the HTTP server is listening, update Miniflare's publicUrl with
			// the actual address. This ensures "Cloudflare Stream" preview URLs always reflect
			// the real server URL — even if Vite bumped the port.
			if (vitePreviewServer.httpServer) {
				vitePreviewServer.httpServer.on("listening", () => {
					const addr = vitePreviewServer.httpServer?.address();
					if (typeof addr === "object" && addr !== null) {
						const serverConfig = vitePreviewServer.config.preview;
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

			// TODO: Reinstate Container preview support when Containers are
			// supported by cloudflare.config.ts.

			handleWebSocket(vitePreviewServer.httpServer, ctx.miniflare);

			// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
			vitePreviewServer.middlewares.use(
				createRequestHandler((request) => {
					const url = new URL(request.url);
					const rewritten = rewriteLegacyMiniflarePath(url.pathname);
					if (rewritten !== url.pathname) {
						url.pathname = rewritten;
						request = new MiniflareRequest(url, request);
					}
					return ctx.miniflare.dispatchFetch(request, { redirect: "manual" });
				})
			);
		},
	};
});
