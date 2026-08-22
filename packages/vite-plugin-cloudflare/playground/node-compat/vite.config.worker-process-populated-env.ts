import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-process-populated-env",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-process-populated-env/index.ts",
				compatibilityDate: "2024-12-30",
				compatibilityFlags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				env: { FOO: { type: "text", value: "foo value" } },
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
