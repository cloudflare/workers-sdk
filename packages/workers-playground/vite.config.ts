import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const playgroundHost = loadEnv(mode, process.cwd())["VITE_PLAYGROUND_ROOT"];
	return {
		plugins: [react()],
		server: {
			proxy: {
				"/playground/api": {
					target: `https://${playgroundHost}`,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/playground/, ""),
				},
			},
		},
		resolve: {
			alias: {
				"react/jsx-runtime.js": "react/jsx-runtime",
			},
		},

		appType: "spa",
		base: "/playground",
		build: {
			chunkSizeWarningLimit: 1000,
		},
	};
});
