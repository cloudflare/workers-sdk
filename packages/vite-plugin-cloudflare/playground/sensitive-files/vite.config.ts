import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		fs: {
			deny: ["custom-sensitive-file"],
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [
				{
					config: {
						name: "worker-b",
						entrypoint: "./worker-b/index.ts",
						compatibilityDate: "2024-12-30",
						env: {
							DEV_VAR: { type: "secret" },
							WORKER_B_ENV: { type: "secret" },
						},
					},
				},
			],
		}),
	],
});
