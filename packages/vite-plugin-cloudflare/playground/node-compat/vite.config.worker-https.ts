import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-https",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-https/index.ts",
				compatibilityDate: "2025-08-15",
				compatibilityFlags: ["nodejs_compat"],
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
