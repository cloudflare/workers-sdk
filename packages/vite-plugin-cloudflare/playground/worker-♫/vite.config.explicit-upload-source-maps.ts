import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		worker: {
			build: {
				sourcemap: true,
			},
		},
	},
	plugins: [
		cloudflare({
			configPath: "./wrangler.explicit-upload-source-maps.jsonc",
			inspectorPort: false,
			persistState: false,
		}),
	],
});
