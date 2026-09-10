import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		ssr: {
			build: {
				rollupOptions: {
					output: {
						// Test that custom entry file extensions are represented correctly in Build Output.
						entryFileNames: "[name].mjs",
					},
				},
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
