import assert from "node:assert";
import {
	addDebugToVitePrintUrls,
	DEBUG_PATH,
	getDebugPathHtml,
	getResolvedInspectorPort,
} from "../debugging";
import { assertIsNotPreview, assertIsPreview } from "../plugin-config";
import { createPlugin } from "./utils";

/**
 * Plugin that provides a `__debug` path for debugging the Workers
 */
export const debugPlugin = createPlugin("debug", (ctx) => {
	return {
		enforce: "pre",
		configureServer(viteDevServer) {
			assertIsNotPreview(ctx.resolvedPluginConfig);
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
					? Object.values(ctx.resolvedPluginConfig.workers).map(
							(worker) => worker.name
						)
					: [];

			viteDevServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
				const resolvedInspectorPort = await getResolvedInspectorPort(
					ctx.resolvedPluginConfig,
					ctx.miniflare
				);

				if (resolvedInspectorPort) {
					const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
					res.setHeader("Content-Type", "text/html");
					res.end(html);
				} else {
					next();
				}
			});
		},
		async configurePreviewServer(vitePreviewServer) {
			assertIsPreview(ctx.resolvedPluginConfig);
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
				assert(worker.name, "Expected the Worker to have a name");
				return worker.name;
			});

			vitePreviewServer.middlewares.use(DEBUG_PATH, async (_, res, next) => {
				const resolvedInspectorPort = await getResolvedInspectorPort(
					ctx.resolvedPluginConfig,
					ctx.miniflare
				);

				if (resolvedInspectorPort) {
					const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
					res.setHeader("Content-Type", "text/html");
					res.end(html);
				} else {
					next();
				}
			});
		},
	};
});
