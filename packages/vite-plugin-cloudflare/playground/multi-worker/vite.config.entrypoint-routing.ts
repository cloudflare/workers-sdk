import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			exposeEntrypoints: true,
			auxiliaryWorkers: [
				{
					configPath: "./worker-b/wrangler.jsonc",
					exposeEntrypoints: true,
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
