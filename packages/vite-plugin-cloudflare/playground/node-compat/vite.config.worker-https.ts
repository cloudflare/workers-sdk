import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerHttpsConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-https",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerHttpsConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
