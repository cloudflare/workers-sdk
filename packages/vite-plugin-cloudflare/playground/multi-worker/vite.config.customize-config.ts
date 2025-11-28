import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./worker-a/wrangler.jsonc",
			// Test configure as a function on entry worker
			configure: () => ({
				compatibility_date: "2025-01-15",
				vars: {
					CONFIGURED_VAR: "entry-worker-value",
				},
			}),
			auxiliaryWorkers: [
				{
					configPath: "./worker-b/wrangler.jsonc",
					// Test configure as an object on auxiliary worker
					configure: {
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
