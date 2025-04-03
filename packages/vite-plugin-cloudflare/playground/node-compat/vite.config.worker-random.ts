import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
