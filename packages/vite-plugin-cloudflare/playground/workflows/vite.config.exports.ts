import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/exports",
	},
	plugins: [
		cloudflare({
			configPath: "./wrangler.exports.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
