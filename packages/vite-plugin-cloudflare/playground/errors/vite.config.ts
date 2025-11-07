import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./src/worker-a/wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "./src/worker-b/wrangler.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
