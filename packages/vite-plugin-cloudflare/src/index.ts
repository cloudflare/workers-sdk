import { assertWranglerVersion } from "./assert-wrangler-version";
import { DEFAULT_COMPAT_DATE } from "./build-constants";
import { PluginContext } from "./context";
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
import { rscPlugin } from "./plugins/rsc";
import { shortcutsPlugin } from "./plugins/shortcuts";
import { triggerHandlersPlugin } from "./plugins/trigger-handlers";
import {
	virtualClientFallbackPlugin,
	virtualModulesPlugin,
} from "./plugins/virtual-modules";
import { wasmHelperPlugin } from "./plugins/wasm";
import { debuglog } from "./utils";
import type { SharedContext } from "./context";
import type { PluginConfig } from "./plugin-config";
import type { CompatDate } from "@cloudflare/workers-utils";
import type * as vite from "vite";

// TODO: simplify this function in the next major release (DEVX-2533)
/**
 * @deprecated Use today's date instead (as `YYYY-MM-DD`)
 *
 * Gets the compatibility date to use with the local workerd version.
 *
 * Note: the function's signature is as is because it needs to be backward compatibly with
 *       a previous iteration of this, it will be simplified in the next major version of this package.
 *
 * @param _options Unused argument (present only for backward compatibility)
 * @returns Object containing the compatibility date (this is not the date directly for backward compatibility)
 */
export function getLocalWorkerdCompatibilityDate(_options?: {
	projectPath?: string;
}): { date: CompatDate; source: "workerd" | "fallback" } {
	return { date: DEFAULT_COMPAT_DATE, source: "workerd" };
}

export type { PluginConfig } from "./plugin-config";
export type { WorkerConfig } from "./workers-configs";

const sharedContext: SharedContext = {
	hasShownWorkerConfigWarnings: false,
	restartingDevServerCount: 0,
};

await assertWranglerVersion();

/**
 * Vite plugin that enables a full-featured integration between Vite and the Cloudflare Workers runtime.
 *
 * See the [README](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme) for more details.
 *
 * @param pluginConfig An optional {@link PluginConfig} object.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin[] {
	const ctx = new PluginContext(sharedContext);

	return [
		{
			name: "vite-plugin-cloudflare",
			sharedDuringBuild: true,
			config(userConfig, env) {
				ctx.setResolvedPluginConfig(
					resolvePluginConfig(pluginConfig, userConfig, env)
				);

				if (env.command === "build") {
					process.env.CLOUDFLARE_VITE_BUILD = "true";
				}
			},
			async configureServer(viteDevServer) {
				// Patch the `server.restart` method to track whether the server is restarting or not.
				const restartServer = viteDevServer.restart.bind(viteDevServer);
				viteDevServer.restart = async () => {
					try {
						ctx.beginRestartingDevServer();
						debuglog("From server.restart(): Restarting server...");
						await restartServer();
						debuglog("From server.restart(): Restarted server...");
					} finally {
						ctx.endRestartingDevServer();
					}
				};
			},
		},
		configPlugin(ctx),
		rscPlugin(ctx),
		devPlugin(ctx),
		previewPlugin(ctx),
		shortcutsPlugin(ctx),
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
