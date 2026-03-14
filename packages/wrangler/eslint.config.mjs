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

	// Enforce using expect from test context for concurrency safety
	{
		files: ["src/__tests__/**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},

	// Enforce using waitFor/waitForFetch helpers instead of bare vi.waitFor in e2e tests
	{
		files: ["e2e/**/*.ts"],
		ignores: ["e2e/helpers/wait-for.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"CallExpression[callee.object.name='vi'][callee.property.name='waitFor']",
					message:
						"Use waitFor() or waitForFetch() from './helpers/wait-for' instead of vi.waitFor().",
				},
			],
		},
	},
]);
