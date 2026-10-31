import { cloudflare } from "@cloudflare/vite-plugin";
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
						entrypoint: "./src/worker-b/index.ts",
						compatibilityDate: "2024-12-30",
						env: {
							NAMED_ENTRYPOINT: {
								type: "worker",
								worker: "worker-b",
								exportName: "NamedEntrypoint",
							},
						},
					},
				},
			],
		}),
	],
});
