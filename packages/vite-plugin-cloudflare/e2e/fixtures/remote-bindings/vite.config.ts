import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./entry-worker/wrangler.jsonc",
			auxiliaryWorkers: [
				{
					configPath: "./auxiliary-worker/wrangler.jsonc",
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
