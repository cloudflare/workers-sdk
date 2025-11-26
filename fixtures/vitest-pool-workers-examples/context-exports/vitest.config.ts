import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./src/wrangler.jsonc",
				},
				miniflare: {
					serviceBindings: {
						AUXILIARY_WORKER: "worker-under-test",
					},
					workers: [
						// Configuration for the "auxiliary" Worker under test.
						// Unfortunately, auxiliary Workers cannot load their configuration
						// from wrangler config files, and must be configured with Miniflare
						// `WorkerOptions`.
						{
							name: "worker-under-test",
							modules: true,
							scriptPath: "./auxiliary-worker/dist/index.js", // Built by `global-setup.ts`
							compatibilityDate: "2025-11-01",
							compatibilityFlags: ["nodejs_compat", "enable_ctx_exports"],
							bindings: {
								NAME: "AuxiliaryWorker",
							},
						},
					],
				},
			},
		},
	},
});
