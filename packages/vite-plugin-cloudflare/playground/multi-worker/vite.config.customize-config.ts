import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			// Test config as a function on entry worker
			config: () => ({
				compatibilityDate: "2025-01-15",
				env: {
					CONFIGURED_VAR: {
						type: "text",
						value: "entry-worker-value",
					},
				},
			}),
			auxiliaryWorkers: {
				auxiliaryWorker: {
					// Test config as an object on auxiliary worker
					config: {
						env: {
							CONFIGURED_VAR: {
								type: "text",
								value: "auxiliary-worker-value",
							},
						},
					},
				},
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
