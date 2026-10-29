import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
			config(loadedConfig) {
				assert(loadedConfig.worker);
				return {
					...loadedConfig,
					worker: {
						...loadedConfig.worker,
						compatibilityFlags: ["nodejs_compat"],
					},
				};
			},
		}),
	],
});
