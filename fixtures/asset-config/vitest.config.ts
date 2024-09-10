import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		chaiConfig: {
			truncateThreshold: 80,
		},
		poolOptions: {
			workers: {
				wrangler: {
					configPath:
						"../../packages/workers-shared/asset-worker/wrangler.toml",
				},
			},
		},
	},
});
