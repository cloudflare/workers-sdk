import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-debug",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-debug/index.ts",
				compatibilityDate: "2025-07-30",
				compatibilityFlags: ["nodejs_compat"],
				env: { DEBUG: { type: "text", value: "example:*,test" } },
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
