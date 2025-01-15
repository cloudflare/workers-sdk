import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-postgres",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-postgres/wrangler.toml",
			persistState: false,
		}),
	],
});
