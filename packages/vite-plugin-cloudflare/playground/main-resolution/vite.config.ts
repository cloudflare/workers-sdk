import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	environments: {
		worker: {
			build: {
				rollupOptions: {
					output: {
						// This is to test that entry file names with custom file extensions are correctly populated in the `main` field of the output `wrangler.json`
						entryFileNames: "[name].mjs",
					},
				},
			},
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
