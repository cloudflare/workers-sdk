import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.with-warning.jsonc",
			auxiliaryWorkers: [
				{ configPath: "./worker-b/wrangler.with-warning.jsonc" },
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
