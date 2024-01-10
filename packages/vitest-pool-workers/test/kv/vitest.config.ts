import {
	defineWorkersPoolOptions,
	kCurrentWorker,
} from "@cloudflare/vitest-pool-workers/config";
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
				async setupEnvironment(env) {
					await env.TEST_NAMESPACE.put("seeded", "🌱");
				},
				miniflare: {
					kvNamespaces: ["TEST_NAMESPACE"],
					compatibilityFlags: ["global_navigator"],
					durableObjects: {
						COUNTER: "Counter",
						OTHER: {
							className: "OtherObject",
							scriptName: "other",
						},
					},
					serviceBindings: {
						SELF: kCurrentWorker,
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
