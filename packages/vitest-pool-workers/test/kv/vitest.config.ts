import path from "node:path";
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
						SELF: "",
					},
					workers: [
						{
							name: "other",
							// TODO(soon): probably want to resolve all these paths relative to
							//  this config file like `main`
							modules: true,
							scriptPath: path.join(__dirname, "other-worker.mjs"),
						},
					],
				},
			}),
		},
	},
});
