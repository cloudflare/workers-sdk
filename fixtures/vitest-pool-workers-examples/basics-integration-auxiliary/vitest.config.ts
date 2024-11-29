import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					// Configuration for the test runner Worker
					compatibilityDate: "2024-01-01",
					compatibilityFlags: [
						// Required to use `WORKER.scheduled()`. This is an experimental
						// compatibility flag, and cannot be enabled in production.
						"service_binding_extra_handlers",
					],
					serviceBindings: {
						WORKER: "worker-under-test",
					},

					workers: [
						// Configuration for the "auxiliary" Worker under test.
						// Unfortunately, auxiliary Workers cannot load their configuration
						// from `wrangler.toml` files, and must be configured with Miniflare
						// `WorkerOptions`.
						{
							name: "worker-under-test",
							modules: true,
							scriptPath: "./dist/index.js", // Built by `global-setup.ts`
							compatibilityDate: "2024-01-01",
						},
					],
				},
			},
		},
	},
});
