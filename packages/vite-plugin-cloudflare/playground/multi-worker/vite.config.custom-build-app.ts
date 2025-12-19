import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-build-app-directory",
	},
	builder: {
		async buildApp(builder) {
			const workerAEnvironment = builder.environments.worker_a;
			assert(workerAEnvironment, `No "worker_a" environment`);

			// We deliberately build just the `worker_a` environment to test that the plugin builds any remaining Worker environments
			await builder.build(workerAEnvironment);
		},
	},
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "./worker-b/wrangler.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
