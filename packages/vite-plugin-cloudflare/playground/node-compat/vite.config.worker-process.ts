import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-process",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-process/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
