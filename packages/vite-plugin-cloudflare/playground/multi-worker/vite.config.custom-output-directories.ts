import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-root-output-directory",
	},
	environments: {
		worker_b: {
			build: {
				outDir: "custom-worker-output-directory",
			},
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			auxiliaryWorkers: [
				{
					config: {
						name: "worker-b",
						entrypoint: "./worker-b/index.ts",
						compatibilityDate: "2024-12-30",
					},
					viteEnvironment: { name: "worker_b" },
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
