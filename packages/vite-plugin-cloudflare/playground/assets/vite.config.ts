import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: path.resolve(import.meta.dirname, "html-page.html"),
				},
			},
		},
		ssr: {
			build: {
				assetsInlineLimit: 0,
			},
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
