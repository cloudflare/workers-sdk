import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "../../packages/workers-shared/asset-worker/wrangler.jsonc",
			},
		}),
	],
	test: {
		chaiConfig: {
			truncateThreshold: 80,
		},
	},
});
