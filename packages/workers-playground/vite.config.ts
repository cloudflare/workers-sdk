import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pluginRewriteAll from "vite-plugin-rewrite-all";
import { fileURLToPath } from "node:url";
// https://vitejs.dev/config/
export default defineConfig({
	plugins: [pluginRewriteAll(), react()],
	server: {
		proxy: {
			"/api": "https://playground.devprod.cloudflare.dev",
		},
	},
	resolve: {
		alias: {
			"@components": fileURLToPath(
				new URL("./src/components", import.meta.url)
			),
		},
	},
	appType: "spa",
});
