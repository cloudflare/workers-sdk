import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			types: { includeRuntime: false },
			auxiliaryWorkers: [
				{
					config: {
						name: "worker-b",
						entrypoint: "./worker-b/index.ts",
						compatibilityDate: "2024-12-30",
						env: {
							GREETING: { type: "text", value: "Hello from Worker B" },
						},
					},
				},
			],
			experimental: { perWorkerModules: true },
		}),
	],
});
