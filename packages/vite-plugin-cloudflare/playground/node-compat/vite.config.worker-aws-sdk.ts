import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-aws-sdk",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-aws-sdk/wrangler.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
