import assert from "node:assert";
import { CoreHeaders } from "miniflare";
import * as vite from "vite";
import {
	addDebugToVitePrintUrls,
	DEBUG_PATH,
	getDebugPathHtml,
	getResolvedInspectorPort,
} from "./debugging";
import { getEntryWorkerConfig } from "./miniflare-options";
import {
	assertIsNotPreview,
	assertIsPreview,
	resolvePluginConfig,
} from "./plugin-config";
import { additionalModulesPlugin } from "./plugins/additional-modules";
import { configPlugin } from "./plugins/config";
import { devPlugin } from "./plugins/dev";
import {
	nodeJsAlsPlugin,
	nodeJsCompatPlugin,
	nodeJsCompatWarningsPlugin,
} from "./plugins/nodejs-compat";
import { outputConfigPlugin } from "./plugins/output-config";
import { previewPlugin } from "./plugins/preview";
import { PluginContext } from "./plugins/utils";
import {
	virtualClientFallbackPlugin,
	virtualModulesPlugin,
} from "./plugins/virtual-modules";
import { wasmHelperPlugin } from "./plugins/wasm";
import { createRequestHandler, debuglog } from "./utils";
import type { PluginConfig } from "./plugin-config";

export type { PluginConfig } from "./plugin-config";

const ctx = new PluginContext();

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin[] {
	ctx.resetLocalState();

	return [
		{
			name: "vite-plugin-cloudflare",
			sharedDuringBuild: true,
			config(userConfig, env) {
				ctx.setResolvedPluginConfig(
					resolvePluginConfig(pluginConfig, userConfig, env)
				);
			},
			async configureServer(viteDevServer) {
				// Patch the `server.restart` method to track whether the server is restarting or not.
				const restartServer = viteDevServer.restart.bind(viteDevServer);
				viteDevServer.restart = async () => {
					try {
						ctx.isRestartingDevServer = true;
						debuglog("From server.restart(): Restarting server...");
						await restartServer();
						debuglog("From server.restart(): Restarted server...");
					} finally {
						ctx.isRestartingDevServer = false;
					}
				};
			},
		},
		// Plugin that provides a `__debug` path for debugging the Workers
		{
			name: "vite-plugin-cloudflare:debug",
			enforce: "pre",
			configureServer(viteDevServer) {
				assertIsNotPreview(ctx.resolvedPluginConfig);
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;

				if (inVscodeJsDebugTerminal) {
					return;
				}

				if (
					ctx.resolvedPluginConfig.type === "workers" &&
					pluginConfig.inspectorPort !== false
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
				// If we're in a JavaScript Debug terminal, Miniflare will send the inspector ports directly to VSCode for registration
				// As such, we don't need our inspector proxy and in fact including it causes issue with multiple clients connected to the
				// inspector endpoint.
				const inVscodeJsDebugTerminal = !!process.env.VSCODE_INSPECTOR_OPTIONS;
				if (inVscodeJsDebugTerminal) {
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
		},
		// Plugin to handle cron/email/etc triggers
		{
			name: "vite-plugin-cloudflare:trigger-handlers",
			enforce: "pre",
			async configureServer(viteDevServer) {
				assertIsNotPreview(ctx.resolvedPluginConfig);

				if (ctx.resolvedPluginConfig.type === "workers") {
					const entryWorkerConfig = getEntryWorkerConfig(
						ctx.resolvedPluginConfig
					);
					assert(entryWorkerConfig, `No entry Worker config`);

					const entryWorkerName = entryWorkerConfig.name;

					// cron && email triggers
					viteDevServer.middlewares.use(
						"/cdn-cgi/handler/",
						(req, res, next) => {
							const requestHandler = createRequestHandler((request) => {
								// set the target service that handles these requests
								// to point to the User Worker (see `getTargetService` fn in
								// `packages/miniflare/src/workers/core/entry.worker.ts`)
								request.headers.set(
									CoreHeaders.ROUTE_OVERRIDE,
									entryWorkerName
								);
								return ctx.miniflare.dispatchFetch(request, {
									redirect: "manual",
								});
							});

							requestHandler(req, res, next);
						}
					);
				}
			},
		},
		configPlugin(ctx),
		devPlugin(ctx),
		previewPlugin(ctx),
		virtualModulesPlugin(ctx),
		virtualClientFallbackPlugin(ctx),
		outputConfigPlugin(ctx),
		wasmHelperPlugin(ctx),
		additionalModulesPlugin(ctx),
		nodeJsAlsPlugin(ctx),
		nodeJsCompatPlugin(ctx),
		nodeJsCompatWarningsPlugin(ctx),
	];
}
