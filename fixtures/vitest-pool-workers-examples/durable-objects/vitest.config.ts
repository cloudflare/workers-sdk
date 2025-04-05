import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		name: "@scoped/durable-objects",
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
