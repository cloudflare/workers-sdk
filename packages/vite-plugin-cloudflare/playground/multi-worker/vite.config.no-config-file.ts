import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			// No configPath - worker-c has no wrangler config file
			config: {
				name: "worker-c",
				main: "./worker-c/index.ts",
				compatibility_date: "2024-12-30",
				services: [{ binding: "WORKER_D", service: "worker-d" }],
			},
			auxiliaryWorkers: [
				{
					// No configPath - worker-d has no wrangler config file
					config: {
						name: "worker-d",
						main: "./worker-d/index.ts",
						compatibility_date: "2024-12-30",
					},
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
