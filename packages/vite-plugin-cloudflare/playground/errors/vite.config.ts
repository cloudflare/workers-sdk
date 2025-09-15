import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./src/worker-a/wrangler.jsonc",
			auxiliaryWorkers: [{ configPath: "./src/worker-b/wrangler.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
