import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-cross-env",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-cross-env/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
