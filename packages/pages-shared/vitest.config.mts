import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				isolatedStorage: false,
				singleWorker: true,
				miniflare: {
					compatibilityDate: "2025-01-01",
				},
			},
		},
	},
});
