import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.primary.jsonc",
			auxiliaryWorkers: [{ configPath: "./wrangler.auxiliary.jsonc" }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
