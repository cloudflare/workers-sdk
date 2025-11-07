import { resolve } from "node:path";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
// @ts-ignore
import testDepPlugin from "@playground/module-resolution-excludes/plugin";

export default defineConfig({
	resolve: {
		alias: {
			"@alias/test": resolve(__dirname, "./src/aliasing.ts"),
		},
	},
	environments: {
		worker: {
			optimizeDeps: {
				exclude: ["@playground/module-resolution-excludes"],
			},
		},
	},
	plugins: [
		cloudflare({ inspectorPort: false, persistState: false }),
		testDepPlugin(),
	],
});
