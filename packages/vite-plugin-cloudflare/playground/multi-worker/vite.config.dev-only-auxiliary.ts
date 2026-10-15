import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "custom-dev-only-directory",
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
					devOnly: true,
				},
			],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
