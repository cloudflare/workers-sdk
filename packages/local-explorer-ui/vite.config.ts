import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		svgr(),
	],
	build: {
		outDir: "dist",
	},
	base: "/cdn-cgi/explorer/",
	server: {
		// lets us develop this package separately from Miniflare without CORS issues.
		proxy: {
			"/cdn-cgi/explorer/api": {
				// your worker will need to be running on localhost:8787 for this to work
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
});
