import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-https",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-https/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
