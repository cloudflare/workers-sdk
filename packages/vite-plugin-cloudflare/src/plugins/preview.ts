import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { cleanupContainers } from "@cloudflare/containers-shared/src/utils";
import colors from "picocolors";
import { getDockerPath } from "../containers";
import { getInputInspectorPortOption } from "../debugging";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import { assertIsPreview } from "../plugin-config";
import { createRequestHandler } from "../utils";
import { handleWebSocket } from "../websockets";
import { createPlugin } from "./utils";

export const previewPlugin = createPlugin("preview", (ctx) => {
	return {
		async configurePreviewServer(vitePreviewServer) {
			assertIsPreview(ctx.resolvedPluginConfig);

			const inputInspectorPort = await getInputInspectorPortOption(
				ctx.resolvedPluginConfig,
				vitePreviewServer
			);

			const { miniflareOptions, containerTagToOptionsMap } =
				await getPreviewMiniflareOptions({
					resolvedPluginConfig: ctx.resolvedPluginConfig,
					vitePreviewServer,
					inspectorPort: inputInspectorPort,
				});
			await ctx.setMiniflareOptions(miniflareOptions);

			if (containerTagToOptionsMap.size > 0) {
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
				});
				const containerImageTagsSeen = new Set(containerTagToOptionsMap.keys());

				vitePreviewServer.config.logger.info(
					colors.dim(colors.yellow("\n⚡️ Containers successfully built.\n"))
				);

				process.on("exit", () => {
					if (containerImageTagsSeen.size) {
						cleanupContainers(dockerPath, containerImageTagsSeen);
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
