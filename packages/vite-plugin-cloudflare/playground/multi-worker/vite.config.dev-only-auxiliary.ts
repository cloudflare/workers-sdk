import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { auxiliaryWorkerConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "custom-dev-only-directory",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			auxiliaryWorkers: [{ config: auxiliaryWorkerConfig, devOnly: true }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
