import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
