import assert from "node:assert";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-resolve-externals",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-resolve-externals/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
		{
			name: "test-plugin",
			async configureServer(viteDevServer) {
				const workerEnvironment = viteDevServer.environments.worker;
				assert(workerEnvironment);

				const resolved =
					await workerEnvironment.pluginContainer.resolveId("node:dns");

				if (resolved) {
					workerEnvironment.logger.info(`__${resolved.id}__`);
				}
			},
		},
	],
});
