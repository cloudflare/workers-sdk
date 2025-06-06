import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		worker: {
			build: {
				assetsInlineLimit: 0,
			},
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
