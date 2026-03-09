import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
	return {
		plugins: [
			react(),
			cloudflare({
				configPath:
					mode === "development" ? "./wrangler.dev.jsonc" : "./wrangler.jsonc",
			}),
		],
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
