import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// Canonical definitions in packages/miniflare/src/plugins/core/constants.ts
// Cannot import from miniflare directly due to circular dependency
// (miniflare depends on @cloudflare/local-explorer-ui)
const LOCAL_EXPLORER_BASE_PATH = "/cdn-cgi/explorer";
const LOCAL_EXPLORER_API_PATH = `${LOCAL_EXPLORER_BASE_PATH}/api`;

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		svgr(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"react/jsx-runtime.js": "react/jsx-runtime",
		},
	},
	define: {
		"import.meta.env.VITE_LOCAL_EXPLORER_API_PATH": JSON.stringify(
			LOCAL_EXPLORER_API_PATH
		),
	},
	build: {
		outDir: "dist",
	},
	base: `${LOCAL_EXPLORER_BASE_PATH}/`,
	server: {
		// lets us develop this package separately from Miniflare without CORS issues.
		proxy: {
			[LOCAL_EXPLORER_API_PATH]: {
				// your worker will need to be running on localhost:8787 for this to work
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
});
