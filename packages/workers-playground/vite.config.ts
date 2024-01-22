import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pluginRewriteAll from "vite-plugin-rewrite-all";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [pluginRewriteAll(), react()],
	server: {
		proxy: {
			"/playground/api": {
				target: "https://playground.devprod.cloudflare.dev",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/playground/, ""),
			},
		},
	},

	appType: "spa",
	base: "/playground",
});
