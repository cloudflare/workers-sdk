import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-warnings",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-warnings/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
