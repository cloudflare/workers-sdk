import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.with-api.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
