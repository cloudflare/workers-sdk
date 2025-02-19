import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: false,
				isolatedStorage: true,
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
