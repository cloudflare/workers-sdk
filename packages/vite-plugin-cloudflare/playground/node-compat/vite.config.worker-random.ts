import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-random",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-random/wrangler.toml",
		}),
	],
});
