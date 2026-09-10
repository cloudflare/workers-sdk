import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-als",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./worker-als/index.ts",
				compatibilityDate: "2024-12-30",
				compatibilityFlags: ["nodejs_als"],
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
