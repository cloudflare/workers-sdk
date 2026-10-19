import assert from "node:assert";
import {
	createDebugMiddleware,
	DEBUG_PATH,
} from "@cloudflare/workers-dev-shared";
import { assertIsNotPreview, assertIsPreview } from "../context";
import { addDebugToVitePrintUrls } from "../debug";
import { createPlugin } from "../utils";

/**
 * Plugin to provide a `/__debug` path for debugging Workers
 */
export const debugPlugin = createPlugin("debug", (ctx) => {
	return {
		enforce: "pre",
		configureServer(viteDevServer) {
			assertIsNotPreview(ctx);
			// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration.
			// As such, we don't need our inspector proxy and in fact including it causes issues with multiple clients connected to the
			// inspector endpoint.
			const isInVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;

			if (isInVscodeJsDebugTerminal) {
				return;
			}

			if (
				ctx.resolvedPluginConfig.type === "workers" &&
				ctx.resolvedPluginConfig.inspectorPort !== false
			) {
				addDebugToVitePrintUrls(viteDevServer);
			}

			const workerNames =
				ctx.resolvedPluginConfig.type === "workers"
					? [
							...ctx.resolvedPluginConfig.environmentNameToWorkerMap.values(),
						].map((worker) => worker.config.name)
					: [];

			viteDevServer.middlewares.use(
				DEBUG_PATH,
				createDebugMiddleware(workerNames, () => ctx.getResolvedInspectorPort())
			);
		},
		async configurePreviewServer(vitePreviewServer) {
			assertIsPreview(ctx);
			// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration.
			// As such, we don't need our inspector proxy and in fact including it causes issues with multiple clients connected to the
			// inspector endpoint.
			const isInVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;

			if (isInVscodeJsDebugTerminal) {
				return;
			}

			if (
				ctx.resolvedPluginConfig.workers.length >= 1 &&
				ctx.resolvedPluginConfig.inspectorPort !== false
			) {
				addDebugToVitePrintUrls(vitePreviewServer);
			}

			const workerNames = ctx.resolvedPluginConfig.workers.map((worker) => {
				assert(worker.config.name, "Expected the Worker to have a name");
				return worker.config.name;
			});

			vitePreviewServer.middlewares.use(
				DEBUG_PATH,
				createDebugMiddleware(workerNames, () => ctx.getResolvedInspectorPort())
			);
		},
	};
});
