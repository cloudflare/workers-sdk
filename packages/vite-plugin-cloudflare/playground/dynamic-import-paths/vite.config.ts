import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
	plugins: [cloudflare({ persistState: false })],
});
