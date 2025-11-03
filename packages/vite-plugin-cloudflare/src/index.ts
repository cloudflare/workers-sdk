import * as vite from "vite";
import { resolvePluginConfig } from "./plugin-config";
import { additionalModulesPlugin } from "./plugins/additional-modules";
import { configPlugin } from "./plugins/config";
import { debugPlugin } from "./plugins/debug";
import { devPlugin } from "./plugins/dev";
import {
	nodeJsAlsPlugin,
	nodeJsCompatPlugin,
	nodeJsCompatWarningsPlugin,
} from "./plugins/nodejs-compat";
import { outputConfigPlugin } from "./plugins/output-config";
import { previewPlugin } from "./plugins/preview";
import { triggerHandlersPlugin } from "./plugins/triggerHandlers";
import { PluginContext } from "./plugins/utils";
import {
	virtualClientFallbackPlugin,
	virtualModulesPlugin,
} from "./plugins/virtual-modules";
import { wasmHelperPlugin } from "./plugins/wasm";
import { debuglog } from "./utils";
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
		configPlugin(ctx),
		devPlugin(ctx),
		previewPlugin(ctx),
		debugPlugin(ctx),
		triggerHandlersPlugin(ctx),
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
