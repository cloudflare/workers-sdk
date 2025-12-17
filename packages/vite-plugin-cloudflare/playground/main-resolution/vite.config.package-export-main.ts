import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		worker: {
			optimizeDeps: {
				exclude: ["@playground/main-resolution-package"],
			},
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			configPath: "./wrangler.package-export-main.jsonc",
		}),
	],
});
