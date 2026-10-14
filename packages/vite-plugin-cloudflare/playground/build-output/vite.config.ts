import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		ssr: {
			build: {
				rollupOptions: {
					output: {
						entryFileNames: "chunks/[name]-[hash].mjs",
					},
				},
			},
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			types: { includeRuntime: false },
		}),
	],
});
