import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-random",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-random/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
