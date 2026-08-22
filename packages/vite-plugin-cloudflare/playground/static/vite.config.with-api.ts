import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: {
				name: "static-with-api",
				entrypoint: "./api/index.ts",
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
