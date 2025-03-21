import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-basic",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-basic/wrangler.toml",
		}),
	],
});
