import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			// Test config as a function on entry worker
			config: () => ({
				compatibility_date: "2025-01-15",
				vars: {
					CONFIGURED_VAR: "entry-worker-value",
				},
			}),
			auxiliaryWorkers: [
				{
					configPath: "./worker-b/wrangler.jsonc",
					// Test config as an object on auxiliary worker
					config: {
						vars: {
							CONFIGURED_VAR: "auxiliary-worker-value",
						},
					},
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
