import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/cloudflare-node",
	},
	plugins: [
		cloudflare({
			configPath: "./cloudflare-node/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
