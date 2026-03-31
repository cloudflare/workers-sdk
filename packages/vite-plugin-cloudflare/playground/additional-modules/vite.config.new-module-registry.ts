import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/new-module-registry",
	},
	plugins: [
		cloudflare({
			configPath: "./wrangler.new-module-registry.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
