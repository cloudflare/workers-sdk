import { defineWorkersPoolOptions } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			workers: defineWorkersPoolOptions({
				isolatedStorage: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["TEST_NAMESPACE"],
				},
			}),
		},
	},
});
