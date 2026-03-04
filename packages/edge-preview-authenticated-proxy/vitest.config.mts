import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				isolatedStorage: false,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
		retry: 2,
	},
});
