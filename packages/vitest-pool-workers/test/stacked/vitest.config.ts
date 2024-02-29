import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		// @ts-expect-error `defineWorkersProject()` expects `pool` to be
		//  `@cloudflare/vitest-pool-workers"` which won't work for us
		pool: "../..",
		poolOptions: {
			workers: {
				isolatedStorage: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["TEST_NAMESPACE"],
				},
			},
		},
	},
});
