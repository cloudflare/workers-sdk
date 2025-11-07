import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			persistState: false,
			configPath: "entry.wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "wrangler.jsonc" }],
		}),
	],
});
