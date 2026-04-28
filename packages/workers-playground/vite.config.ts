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
				// @cloudflare/style-provider ships a hybrid ESM+CJS package: its es/ directory
				// contains files that are nominally ESM but internally use require(). Vite 8's
				// bundler (rolldown) mishandles this pattern and generates an anonymous,
				// unreachable module initializer, leaving `createRenderer` as undefined at
				// runtime (TypeError: createRenderer is not a function).
				// Aliasing to the CJS build (lib/) avoids this — rolldown handles plain CJS
				// correctly via its interop layer.
				"@cloudflare/style-provider": "@cloudflare/style-provider/lib/index.js",
				"react/jsx-runtime.js": "react/jsx-runtime",
			},
		},

		appType: "spa",
		build: {
			chunkSizeWarningLimit: 1000,
			// The application is actually hosted at `playground/`, but we can't use the `base` option.
			// That would  cause Vite to put the assets directly in `dist/assets` and to refer to them via `/playground/assets/` in the generated HTML.
			// But Wrangler will upload the assets as though they were in `/assets` and so the links in the HTML would be broken.
			// By keeping the assets in `dist/playground/assets`, the links in the HTML will match the actual location of the assets when deployed.
			assetsDir: "playground/assets",
		},
	};
});
