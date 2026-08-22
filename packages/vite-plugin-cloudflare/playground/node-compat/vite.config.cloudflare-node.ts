import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/cloudflare-node",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "worker",
				entrypoint: "./cloudflare-node/index.ts",
				compatibilityDate: "2025-11-13",
				compatibilityFlags: ["nodejs_compat"],
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
