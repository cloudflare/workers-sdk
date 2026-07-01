import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		build_output_worker: {
			build: {
				sourcemap: true,
			},
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			experimental: {
				newConfig: { cfBuildOutput: true },
			},
		}),
	],
});
