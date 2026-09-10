import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-build-app-directory",
	},
	builder: {
		async buildApp(builder) {
			const workerAEnvironment = builder.environments.ssr;
			assert(workerAEnvironment, `No "ssr" environment`);

			// We deliberately build just the entry Worker environment to test that the plugin builds any remaining Worker environments
			await builder.build(workerAEnvironment);
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
