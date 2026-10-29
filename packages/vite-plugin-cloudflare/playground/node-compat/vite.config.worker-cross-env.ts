import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-cross-env",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-cross-env/index.ts",
				compatibilityDate: "2024-12-30",
				compatibilityFlags: ["nodejs_compat"],
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
