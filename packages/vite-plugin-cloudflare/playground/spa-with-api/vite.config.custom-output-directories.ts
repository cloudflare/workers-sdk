import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
	plugins: [react(), cloudflare({ persistState: false })],
});
