import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		worker: {
			build: {
				assetsInlineLimit: 0,
			},
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config(config) {
				delete config.entrypoint;
				config.name = "public-only";
				config.assets = {};
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
