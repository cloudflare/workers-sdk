import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

// TODO: add linting for `startDevWorker` workers in `templates/startDevWorker`

export default defineConfig([
	globalIgnores([
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"emitted-types",
		"kv-asset-handler.js",
		"**/templates/**/*.*",
		".e2e-test-report",
		".tmp",
	]),
	sharedConfig,
	{
		files: ["**/*.ts"],
		ignores: ["**/*.test.ts", "tsup.config.ts", "scripts/**", "e2e/**"],
		rules: {
			"no-console": "error",
			"no-restricted-globals": [
				"error",
				{
					name: "__dirname",
					message: "Use `getBasePath()` instead.",
				},
				{
					name: "__filename",
					message: "Use `getBasePath()` instead.",
				},
				{
					name: "fetch",
					message: "Use undici's fetch instead",
				},
			],
		},
	},
	// Bucket 1: pages, d1, kv, queues
	{
		files: ["src/__tests__/{pages,d1,kv,queues}/**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
