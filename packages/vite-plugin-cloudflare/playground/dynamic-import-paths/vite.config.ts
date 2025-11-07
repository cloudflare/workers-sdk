import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	environments: {
		worker: {
			build: {
				rollupOptions: {
					output: {
						preserveModules: true,
					},
				},
			},
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
