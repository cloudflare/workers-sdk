import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

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
	plugins: [react(), cloudflare()],
});
