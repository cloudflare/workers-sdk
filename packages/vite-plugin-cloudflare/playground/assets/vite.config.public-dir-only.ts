import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

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
			configPath: "./wrangler.public-dir-only.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
