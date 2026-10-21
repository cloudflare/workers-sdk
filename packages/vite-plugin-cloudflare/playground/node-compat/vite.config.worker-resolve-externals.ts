import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-resolve-externals",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-resolve-externals/index.ts",
				compatibilityDate: "2024-12-30",
				compatibilityFlags: ["nodejs_compat"],
			},
			inspectorPort: false,
			persistState: false,
		}),
		{
			name: "test-plugin",
			async configureServer(viteDevServer) {
				const workerEnvironment = viteDevServer.environments.ssr;
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
