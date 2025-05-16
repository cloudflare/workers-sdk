import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.vite-multi-workers.jsonc",
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [
				{
					configPath: "./wrangler.vite-multi-workers.health.jsonc",
				},
			],
		}),
	],
});
