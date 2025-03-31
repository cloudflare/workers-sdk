import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [{ configPath: "./aux-worker/wrangler.toml" }],
		}),
	],
});
