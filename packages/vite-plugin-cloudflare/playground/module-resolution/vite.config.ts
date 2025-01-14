import { resolve } from "node:path";
import { cloudflare } from "@flarelabs-net/vite-plugin-cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"@alias/test": resolve(__dirname, "./src/aliasing.ts"),
		},
	},
	plugins: [cloudflare({ persistState: false })],
});
