import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	mode: "package-export-main",
	environments: {
		worker: {
			optimizeDeps: {
				exclude: ["@playground/main-resolution-package"],
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
