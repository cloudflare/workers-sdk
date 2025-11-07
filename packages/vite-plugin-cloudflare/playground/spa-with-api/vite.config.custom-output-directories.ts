import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
	build: {
		outDir: "custom-root-output-directory",
	},
	environments: {
		client: {
			build: {
				outDir: "custom-client-output-directory",
			},
		},
	},
	plugins: [react(), cloudflare({ inspectorPort: false, persistState: false })],
});
