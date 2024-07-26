import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import pluginRewriteAll from "vite-plugin-rewrite-all";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const playgroundHost = loadEnv(mode, process.cwd())["VITE_PLAYGROUND_ROOT"];
	return {
		plugins: [pluginRewriteAll(), react()],
		server: {
			proxy: {
				"/playground/api": {
					target: `https://${playgroundHost}`,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/playground/, ""),
				},
			},
		},

		appType: "spa",
		base: "/playground",
		build: {
			chunkSizeWarningLimit: 1000,
		},
	};
});
