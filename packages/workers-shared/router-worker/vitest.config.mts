import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./router-worker/wrangler.jsonc",
			},
		}),
	],
	test: {
		reporters: ["default"],
		testTimeout: 50_000,
	},
});
