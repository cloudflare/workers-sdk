import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerAlsConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-als",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerAlsConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
