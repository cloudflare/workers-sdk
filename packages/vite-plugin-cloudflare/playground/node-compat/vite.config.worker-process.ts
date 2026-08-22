import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerProcessConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-process",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerProcessConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
