import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	build: {
		outDir: "dist/worker-postgres",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-postgres/wrangler.toml",
		}),
	],
});
