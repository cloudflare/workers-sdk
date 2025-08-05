import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// Override the default public directory to use the assets directory
	// so that other vite projects won't share the same assets
	publicDir: "./assets",
	plugins: [
		cloudflare({
			configPath: "./wrangler.worker-entrypoint-b.jsonc",
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [
				{
					configPath: "./wrangler.durable-object.jsonc",
				},
			],
		}),
	],
});
