import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

// TODO: add linting for `startDevWorker` workers in `templates/startDevWorker`

export default defineConfig([
	globalIgnores([
		"e2e/**/fixtures/**",
		"**/templates/**/*.*",
		"!**/templates*/**/c3.ts",
		"scripts/**",
	]),
	{ extends: [sharedConfig], rules: { "no-console": "error" } },
	// Enable no-vitest-import-expect for test files
	{
		files: [
			"**/*.test.ts",
			"**/*.spec.ts",
			"**/test/**/*.ts",
			"**/__tests__/**/*.ts",
			"**/e2e/**/*.ts",
		],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
