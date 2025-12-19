import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { auxiliaryWorker } from "./vitest.config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./src/wrangler.jsonc" },
			miniflare: {
				workers: [auxiliaryWorker],
			},
			additionalExports: {
				// This entrypoint is wildcard re-exported from a virtual module so we cannot automatically infer it.
				ConfiguredVirtualEntryPoint: "WorkerEntrypoint",
			},
		}),
	],

	test: {
		name: "context-exports-isolated-storage",
		globalSetup: ["./global-setup.ts"],

		alias: {
			// This alias is used to simulate a virtual module that Vitest and TypeScript can understand,
			// but esbuild (used by the vitest-pool-workers to guess exports) cannot.
			"@virtual-module": "./virtual.ts",
		},
	},
});
