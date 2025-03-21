import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-cross-env",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-cross-env/wrangler.toml",
		}),
	],
});
