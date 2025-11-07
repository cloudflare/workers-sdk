import * as path from "node:path";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: path.resolve(__dirname, "html-page.html"),
				},
			},
		},
		worker: {
			build: {
				assetsInlineLimit: 0,
			},
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
