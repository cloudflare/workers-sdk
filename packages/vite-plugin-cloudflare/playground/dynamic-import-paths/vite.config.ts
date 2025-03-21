import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

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
	plugins: [cloudflare()],
});
