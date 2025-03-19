import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"@alias/test": resolve(__dirname, "./src/aliasing.ts"),
		},
	},
	plugins: [cloudflare({ persistState: false })],
});
