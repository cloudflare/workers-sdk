import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

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

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./src/wrangler.jsonc" },
			miniflare: {
				workers: [auxiliaryWorker],
			},
		}),
	],

	test: {
		globalSetup: ["./global-setup.ts"],
	},
});
