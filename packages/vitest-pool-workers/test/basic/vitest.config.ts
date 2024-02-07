import { defineWorkersPoolOptions } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./setup/setup.ts"],
		globalSetup: ["./setup/global-setup.ts"],
		pool: "../..",
		poolOptions: {
			workers: defineWorkersPoolOptions(({ inject }) => ({
				singleWorker: true,
				miniflare: {
					compatibilityFlags: ["global_navigator"],
					bindings: { KEY: "value" },
					// This doesn't actually do anything in tests
					upstream: `http://localhost:${inject("port")}`,
					hyperdrives: {
						DATABASE: `postgres://user:pass@example.com:${inject("port")}/db`,
					},
				},
			})),
		},
	},
});
