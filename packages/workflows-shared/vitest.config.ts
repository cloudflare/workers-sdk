import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				main: "src/index.ts",
				miniflare: {
					compatibilityDate: "2025-02-04",
					durableObjects: {
						ENGINE: {
							className: "Engine",
							useSQLite: true,
						},
					},
				},
			},
		},
	},
});
