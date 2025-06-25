import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
// @ts-ignore
import testDepPlugin from "@playground/module-resolution-excludes/plugin";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"@alias/test": resolve(__dirname, "./src/aliasing.ts"),
		},
	},
	environments: {
		worker: {
			optimizeDeps: {
				exclude: ["@cloudflare-dev-module-resolution/excludes"],
			},
		},
	},
	plugins: [
		cloudflare({ inspectorPort: false, persistState: false }),
		testDepPlugin(),
	],
});
