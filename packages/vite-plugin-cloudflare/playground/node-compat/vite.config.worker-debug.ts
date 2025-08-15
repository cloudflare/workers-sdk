import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
