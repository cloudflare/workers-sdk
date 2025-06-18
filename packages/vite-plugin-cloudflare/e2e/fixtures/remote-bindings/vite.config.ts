import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
			experimental: { remoteBindings: true },
		}),
	],
});
