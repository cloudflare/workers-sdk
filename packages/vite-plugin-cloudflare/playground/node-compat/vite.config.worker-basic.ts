import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-basic",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-basic/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
