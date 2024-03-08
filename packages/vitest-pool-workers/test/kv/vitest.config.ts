import { defineWorkersPoolOptions } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			workers: defineWorkersPoolOptions({
				isolatedStorage: true,
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
			}),
		},
	},
});
