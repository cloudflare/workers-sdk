import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker-c",
				entrypoint: "./worker-c/index.ts",
				compatibilityDate: "2024-12-30",
				env: {
					WORKER_D: { type: "worker", worker: "worker-d" },
				},
			},
			auxiliaryWorkers: {
				workerD: {
					config: {
						name: "worker-d",
						entrypoint: "./worker-d/index.ts",
						compatibilityDate: "2024-12-30",
					},
				},
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
