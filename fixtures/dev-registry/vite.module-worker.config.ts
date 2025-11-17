import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.module-worker.jsonc",
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [{ configPath: "./wrangler.worker-entrypoint.jsonc" }],
		}),
	],
});
