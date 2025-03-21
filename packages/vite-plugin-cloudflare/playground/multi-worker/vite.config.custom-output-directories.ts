import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-root-output-directory",
	},
	environments: {
		worker_b: {
			build: {
				outDir: "custom-worker-output-directory",
			},
		},
	},
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.toml",
			auxiliaryWorkers: [{ configPath: "./worker-b/wrangler.toml" }],
			persistState: false,
		}),
	],
});
