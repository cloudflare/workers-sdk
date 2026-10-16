import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./asset-worker/wrangler.jsonc",
			},
		}),
	],
	test: {
		reporters: ["default"],
		globals: true,
		testTimeout: 50_000,
	},
});
