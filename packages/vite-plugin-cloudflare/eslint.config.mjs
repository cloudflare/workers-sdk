import sharedConfig from "@cloudflare/eslint-config-shared";
import noVitestImportExpect from "@cloudflare/eslint-config-shared/rules/no-vitest-import-expect";
import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores([
		"**/dist",
		"scripts/**",
		"tsdown.config.ts",
		"vitest.config.ts",
		"src/__tests__/fixtures/**",
		"playground/containers/container/**",
		"playground/main-resolution/package/**",
		"playground/middleware-mode/server.js",
		"playground/module-resolution/packages/**",
		"playground/node-compat/worker-process-populated-env/**",
		"playground/prisma/src/generated/**",
	]),
	{
		extends: [sharedConfig],
		ignores: ["e2e/**"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					// Restrict named imports from "wrangler"
					// Use `import * as wrangler from "wrangler"` instead
					// See https://github.com/cloudflare/workers-sdk/pull/11265
					selector:
						'ImportDeclaration[source.value="wrangler"]:not([importKind="type"]):has(ImportSpecifier)',
					message:
						'Named imports from "wrangler" are not allowed. Use namespace import instead: import * as wrangler from "wrangler"',
				},
			],
		},
	},
	// Enable no-vitest-import-expect for e2e tests (only this rule, not the full shared config)
	{
		files: ["e2e/**/*.test.ts"],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			"workers-sdk": {
				rules: { "no-vitest-import-expect": noVitestImportExpect },
			},
		},
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
	// Enable no-vitest-import-expect for playground and src test files
	{
		files: [
			"playground/**/__tests__/**/*.ts",
			"src/**/*.spec.ts",
			"src/**/__tests__/**/*.spec.ts",
		],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
