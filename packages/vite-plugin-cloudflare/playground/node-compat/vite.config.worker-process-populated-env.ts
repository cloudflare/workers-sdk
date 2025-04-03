import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-process-populated-env",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-process-populated-env/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
