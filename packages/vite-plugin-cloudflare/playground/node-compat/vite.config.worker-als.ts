import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-als",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-als/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
