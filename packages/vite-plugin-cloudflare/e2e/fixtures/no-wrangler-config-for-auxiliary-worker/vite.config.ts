import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [{ configPath: "./aux-worker/wrangler.jsonc" }],
		}),
	],
});
