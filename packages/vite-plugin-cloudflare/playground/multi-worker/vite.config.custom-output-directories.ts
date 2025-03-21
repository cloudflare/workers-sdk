import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

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
		}),
	],
});
