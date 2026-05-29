import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.web.jsonc",
			auxiliaryWorkers: [{ configPath: "./wrangler.api.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
