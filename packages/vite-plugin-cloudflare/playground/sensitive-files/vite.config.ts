import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	server: {
		fs: {
			deny: ["custom-sensitive-file"],
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [{ configPath: "./worker-b/wrangler.jsonc" }],
		}),
	],
});
