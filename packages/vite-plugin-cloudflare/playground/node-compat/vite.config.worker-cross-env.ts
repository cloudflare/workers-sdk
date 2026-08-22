import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerCrossEnvConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-cross-env",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerCrossEnvConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
