import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./workers/web/wrangler.jsonc",
			auxiliaryWorkers: [
				{ configPath: "./workers/api/wrangler.jsonc" },
				{ configPath: "./workers/mock-browser/wrangler.jsonc" },
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
