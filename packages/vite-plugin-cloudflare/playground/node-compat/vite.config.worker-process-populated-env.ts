import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-process",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-process-populated-env/wrangler.toml",
			persistState: false,
		}),
	],
});
