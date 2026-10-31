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
