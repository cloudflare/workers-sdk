import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerBasicConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-basic",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerBasicConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
