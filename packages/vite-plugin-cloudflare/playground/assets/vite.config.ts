import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
