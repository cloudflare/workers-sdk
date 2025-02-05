import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					pipelines: ["PIPELINE"],
				},
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
