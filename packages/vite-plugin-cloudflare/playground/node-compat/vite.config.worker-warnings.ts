import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-warnings",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-warnings/wrangler.toml",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
