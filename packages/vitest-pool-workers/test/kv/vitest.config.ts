import { defineWorkersPoolOptions } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// TODO: only really need this for stuff not fetched from module fallback service,
	//  all node_modules should be externalised and come from that
	resolve: {
		conditions: ["workerd", "worker"],
	},
	test: {
		pool: "../..",
		poolOptions: {
			workers: defineWorkersPoolOptions({
				main: "./worker.ts",
				isolatedStorage: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["TEST_NAMESPACE"],
					durableObjects: {
						COUNTER: "Counter",
						OTHER: {
							className: "OtherObject",
							scriptName: "other",
						},
					},
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
			}),
		},
	},
});
