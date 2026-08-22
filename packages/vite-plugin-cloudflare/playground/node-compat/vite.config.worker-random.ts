import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerRandomConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-random",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerRandomConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
