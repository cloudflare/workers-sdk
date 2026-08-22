import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerDebugConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-debug",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerDebugConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
