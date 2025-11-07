import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-postgres",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-postgres/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
