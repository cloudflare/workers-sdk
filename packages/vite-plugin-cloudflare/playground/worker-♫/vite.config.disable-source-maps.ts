import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		worker: {
			build: {
				sourcemap: false,
			},
		},
	},
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
