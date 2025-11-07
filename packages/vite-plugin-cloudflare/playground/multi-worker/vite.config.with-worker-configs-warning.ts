import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

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
