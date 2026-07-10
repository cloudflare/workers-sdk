import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [{ configPath: "./auxiliary/cloudflare.config.ts" }],
			inspectorPort: false,
			persistState: false,
			experimental: { newConfig: true },
		}),
	],
});
