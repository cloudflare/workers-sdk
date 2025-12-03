import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { cleanupContainers } from "@cloudflare/containers-shared/src/utils";
import colors from "picocolors";
import { getDockerPath } from "../containers";
import { assertIsPreview } from "../context";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import { createPlugin, createRequestHandler } from "../utils";
import { handleWebSocket } from "../websockets";

let exitCallback = () => {};

process.on("exit", () => {
	exitCallback();
});

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

			const { miniflareOptions, containerTagToOptionsMap } =
				await getPreviewMiniflareOptions(ctx, vitePreviewServer);

			await ctx.startOrUpdateMiniflare(miniflareOptions);

			if (containerTagToOptionsMap.size) {
				const dockerPath = getDockerPath();

				vitePreviewServer.config.logger.info(
					colors.dim(
						colors.yellow("∷ Building container images for local preview...\n")
					)
				);

				await prepareContainerImagesForDev({
					dockerPath: getDockerPath(),
					containerOptions: [...containerTagToOptionsMap.values()],
					onContainerImagePreparationStart: () => {},
					onContainerImagePreparationEnd: () => {},
					logger: vitePreviewServer.config.logger,
					isVite: true,
				});

				const containerImageTags = new Set(containerTagToOptionsMap.keys());
				vitePreviewServer.config.logger.info(
					colors.dim(colors.yellow("\n⚡️ Containers successfully built.\n"))
				);

				exitCallback = () => {
					if (containerImageTags.size) {
						cleanupContainers(dockerPath, containerImageTags);
					}
				};
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
