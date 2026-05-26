import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-dev-only-directory",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			auxiliaryWorkers: [
				{ configPath: "./worker-b/wrangler.jsonc", devOnly: true },
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
