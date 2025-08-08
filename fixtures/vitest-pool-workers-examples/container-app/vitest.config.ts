import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
