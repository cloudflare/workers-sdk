import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-basic",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-basic/wrangler.toml",
			persistState: false,
		}),
	],
});
