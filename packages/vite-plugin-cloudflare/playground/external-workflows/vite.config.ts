import { cloudflare } from "@cloudflare/vite-plugin";
import { exports as workerExports } from "cf/config";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [
				{
					config: {
						name: "worker-b",
						compatibilityDate: "2024-12-30",
						entrypoint: "./worker-b/index.ts",
						compatibilityFlags: ["enable_ctx_exports"],
						exports: {
							MyWorkflow: workerExports.workflow({ name: "workflow" }),
						},
					},
				},
			],
		}),
	],
});
