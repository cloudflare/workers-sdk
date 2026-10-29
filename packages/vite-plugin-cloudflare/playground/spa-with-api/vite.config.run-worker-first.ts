import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			types: { includeRuntime: false },
			config(loadedConfig) {
				assert(loadedConfig.worker);
				return {
					...loadedConfig,
					worker: {
						...loadedConfig.worker,
						assets: { ...loadedConfig.worker.assets, runWorkerFirst: true },
					},
				};
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
