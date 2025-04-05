import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "./worker-b/wrangler.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
