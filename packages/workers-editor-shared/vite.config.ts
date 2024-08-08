import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import pluginRewriteAll from "vite-plugin-rewrite-all";

// See https://github.com/facebook/create-react-app/issues/11769
// Turn react/jsx-runtime imports into react/jsx-runtime.js
function addJsxRuntimeExtension() {
	return {
		name: "jsx-runtime-extension",
		enforce: "pre",
		resolveId(source) {
			if (source === "react/jsx-runtime") {
				return {
					id: "react/jsx-runtime.js",
					external: true,
				};
			}
			return null;
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		pluginRewriteAll(),
		react(),
		dts({ rollupTypes: true }),
		addJsxRuntimeExtension(),
	],
	build: {
		chunkSizeWarningLimit: 1000,
		lib: {
			entry: resolve(__dirname, "lib/index.ts"),
			formats: ["es"],
			fileName: "index",
		},
		rollupOptions: {
			external: [
				"react",
				// react/jsx-runtime is externalised by the addJsxRuntimeExtension() plugin
				"@cloudflare/style-container",
				"@cloudflare/style-const",
			],
		},
	},
});
