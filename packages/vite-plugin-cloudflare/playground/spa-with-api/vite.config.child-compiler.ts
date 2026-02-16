import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { createServer, defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * Emulates React Router's child compiler setup, which create a child Vite dev server and
 * removes `configureServer` hooks from plugins.
 *
 * @see https://github.com/cloudflare/workers-sdk/issues/8909
 */
function childCompilerPlugin(): Plugin {
	return {
		name: "test-child-compiler",
		async configResolved(resolvedConfig) {
			if (resolvedConfig.command !== "build") {
				return;
			}

			const childServer = await createServer({
				root: resolvedConfig.root,
				configFile: false,
				plugins: resolvedConfig.plugins
					.filter((plugin) => plugin.name !== "test-child-compiler")
					.map((plugin) => ({ ...plugin, configureServer: undefined })),
			});

			// This is the code path that triggers the bug: Vite's dep optimizer
			// or module pruning calls hot.send() on the worker environment, but
			// the WebSocket was never initialized because configureServer (which
			// calls initRunner) was stripped.
			const workerEnvironment = childServer.environments.worker;
			if (workerEnvironment) {
				workerEnvironment.hot.send({ type: "full-reload", path: "*" });
			}

			await childServer.close();
		},
	};
}

export default defineConfig({
	plugins: [
		react(),
		cloudflare({ inspectorPort: false, persistState: false }),
		childCompilerPlugin(),
	],
});
