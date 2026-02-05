import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import { LOCAL_EXPLORER_BASE_PATH } from "./src/constants";

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
	base: `${LOCAL_EXPLORER_BASE_PATH}/`,
	server: {
		// lets us develop this package separately from Miniflare without CORS issues.
		proxy: {
			[`${LOCAL_EXPLORER_BASE_PATH}/api`]: {
				// your worker will need to be running on localhost:8787 for this to work
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
});
