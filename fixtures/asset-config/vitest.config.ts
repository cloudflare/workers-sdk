import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
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
