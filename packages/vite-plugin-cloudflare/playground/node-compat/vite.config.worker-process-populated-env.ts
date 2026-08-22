import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerProcessPopulatedEnvConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-process-populated-env",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerProcessPopulatedEnvConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
