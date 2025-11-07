import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-https",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-https/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
