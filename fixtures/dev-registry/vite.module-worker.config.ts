import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.module-worker.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
