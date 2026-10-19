import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), cloudflare()],
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
		// The application is hosted at `/playground/`, but setting `base` would only
		// prefix the generated URLs; files would still be emitted under `/assets/`.
		// Emit them under `playground/assets` so their deployed paths match the URLs.
		// TODO: Use `assets.basePath` with Vite's `base` option instead of this workaround
		assetsDir: "playground/assets",
	},
});
