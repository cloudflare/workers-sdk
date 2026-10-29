import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		ssr: {
			build: {
				rollupOptions: {
					output: {
						preserveModules: true,
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
