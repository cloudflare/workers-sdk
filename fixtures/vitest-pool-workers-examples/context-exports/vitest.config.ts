import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

// Configuration for the "auxiliary" Worker under test.
// Unfortunately, auxiliary Workers cannot load their configuration
// from wrangler config files, and must be configured with Miniflare
// `WorkerOptions`.
export const auxiliaryWorker = {
	name: "auxiliary-worker",
	modules: true,
	scriptPath: "./auxiliary-worker/dist/index.js", // Built by `global-setup.ts`
	compatibilityDate: "2025-11-01",
	compatibilityFlags: ["nodejs_compat", "enable_ctx_exports"],
	bindings: {
		NAME: "AuxiliaryWorker",
	},
};

export default defineWorkersProject({
	test: {
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./src/wrangler.jsonc" },
				miniflare: {
					workers: [auxiliaryWorker],
				},
			},
		},
	},
});
