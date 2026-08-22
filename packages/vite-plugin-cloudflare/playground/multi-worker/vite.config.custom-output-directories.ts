import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { auxiliaryWorkerConfig } from "./worker-configs";

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
			types: { includeRuntime: false },
			auxiliaryWorkers: [{ config: auxiliaryWorkerConfig }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
