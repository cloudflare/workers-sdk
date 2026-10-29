import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		ssr: {
			build: {
				assetsInlineLimit: 0,
			},
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config(loadedConfig) {
				assert(loadedConfig.worker);
				return {
					...loadedConfig,
					worker: {
						...loadedConfig.worker,
						entrypoint: undefined,
						name: "public-only",
					},
				};
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
