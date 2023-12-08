import { defineWorkersPoolOptions } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			workers: defineWorkersPoolOptions({
				singleWorker: true,
				miniflare: {
					bindings: { KEY: "value" },
				},
			}),
		},
	},
});
