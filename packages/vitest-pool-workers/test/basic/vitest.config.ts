import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		setupFiles: ["./setup/setup.ts"],
		globalSetup: ["./setup/global-setup.ts"],
		// @ts-expect-error `defineWorkersProject()` expects `pool` to be
		//  `@cloudflare/vitest-pool-workers"` which won't work for us
		pool: "../..",
		poolOptions: {
			workers: ({ inject }) => ({
				singleWorker: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
					bindings: { KEY: "value" },
					// This doesn't actually do anything in tests
					upstream: `http://localhost:${inject("port")}`,
					hyperdrives: {
						DATABASE: `postgres://user:pass@example.com:${inject("port")}/db`,
					},
				},
			}),
		},
	},
});
