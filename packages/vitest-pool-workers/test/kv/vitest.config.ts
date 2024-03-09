import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		// @ts-expect-error `defineWorkersProject()` expects `pool` to be
		//  `@cloudflare/vitest-pool-workers"` which won't work for us
		pool: "../..",
		poolOptions: {
			workers: {
				miniflare: {
					serviceBindings: {
						SEED_NURSERY: {
							disk: { path: __dirname, writable: false },
						},
					},
					workers: [
						{
							name: "other",
							modules: true,
							scriptPath: "other-worker.mjs",
						},
					],
				},
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
