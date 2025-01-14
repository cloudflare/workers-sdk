import { cloudflare } from "@flarelabs-net/vite-plugin-cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-process",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-process/wrangler.toml",
			persistState: false,
		}),
	],
});
