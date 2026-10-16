import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { buildPublicUrl } from "miniflare";
import colors from "picocolors";
import { prepareContainerImagesForVite } from "../containers";
import { assertIsPreview } from "../context";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import { createPlugin, createRequestHandler } from "../utils";
import { handleWebSocket } from "../websockets";

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

			const { miniflareOptions, containerOptions } =
				await getPreviewMiniflareOptions(ctx, vitePreviewServer);
			await ctx.startOrUpdateMiniflare(miniflareOptions);

			if (containerOptions !== undefined) {
				vitePreviewServer.config.logger.info(
					colors.dim(
						colors.yellow("∷ Preparing Containers for local preview...\n")
					)
				);
				// Local application images were prepared by the build and are
				// referenced directly from Build Output. Remote references are pulled
				// here so managed registry authentication can be applied. The
				// Miniflare Container sidecar is always prepared as well.
				await prepareContainerImagesForVite({
					dockerPath: getDockerPath(),
					containerOptions,
					settings: ctx.resolvedPluginConfig.settings,
					logger: vitePreviewServer.config.logger,
				});
			}

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

			handleWebSocket(vitePreviewServer.httpServer, ctx.miniflare);

			// In preview mode we put our middleware at the front of the chain so that all assets are handled in Miniflare
			vitePreviewServer.middlewares.use(
				createRequestHandler((request) => {
					return ctx.miniflare.dispatchFetch(request, { redirect: "manual" });
				})
			);
		},
	};
});
