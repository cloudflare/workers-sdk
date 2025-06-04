import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
