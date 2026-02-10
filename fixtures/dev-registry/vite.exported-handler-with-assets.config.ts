import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// Override the default public directory to use the assets directory
	// so that other non assets vite projects won't share the same assets
	publicDir: "./assets",
	plugins: [
		cloudflare({
			configPath: "./wrangler.exported-handler-with-assets.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
