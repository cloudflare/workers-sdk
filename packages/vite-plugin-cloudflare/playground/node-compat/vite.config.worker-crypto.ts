import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-crypto",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-crypto/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
