import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
				const id =
					await viteDevServer.environments.worker?.pluginContainer.resolveId(
						"node:dns"
					);
				console.log(id);
			},
		},
	],
});
