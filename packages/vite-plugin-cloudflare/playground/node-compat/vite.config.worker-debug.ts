import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-debug",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-debug/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
