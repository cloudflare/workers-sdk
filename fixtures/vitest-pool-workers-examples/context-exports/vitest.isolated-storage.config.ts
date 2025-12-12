import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { auxiliaryWorker } from "./vitest.config";

export default defineWorkersProject({
	test: {
		name: "context-exports-isolated-storage",
		globalSetup: ["./global-setup.ts"],
		poolOptions: {
			workers: {
				isolatedStorage: true,
				wrangler: { configPath: "./src/wrangler.jsonc" },
				miniflare: {
					workers: [auxiliaryWorker],
				},
				additionalExports: {
					// This entrypoint is wildcard re-exported from a virtual module so we cannot automatically infer it.
					ConfiguredVirtualEntryPoint: "WorkerEntrypoint",
				},
			},
		},
		alias: {
			// This alias is used to simulate a virtual module that Vitest and TypeScript can understand,
			// but esbuild (used by the vitest-pool-workers to guess exports) cannot.
			"@virtual-module": "./virtual.ts",
		},
	},
});
