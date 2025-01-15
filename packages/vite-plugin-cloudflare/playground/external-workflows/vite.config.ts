import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.toml",
			auxiliaryWorkers: [{ configPath: "./worker-b/wrangler.toml" }],
			persistState: false,
		}),
	],
});
