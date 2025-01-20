import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-crypto",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-crypto/wrangler.toml",
			persistState: false,
		}),
	],
});
