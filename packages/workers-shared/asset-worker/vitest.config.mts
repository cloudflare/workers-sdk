import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
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
		globals: true,
		testTimeout: 50_000,
	},
});
