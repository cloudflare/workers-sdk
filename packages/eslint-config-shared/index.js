import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import noOnlyTests from "eslint-plugin-no-only-tests";
import turbo from "eslint-plugin-turbo";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import noUnsafeCommandExecution from "./rules/no-unsafe-command-execution.mjs";

export default defineConfig(
	globalIgnores([
		"**/node_modules/**/*",
		"eslint.config.mts",
		"eslint.config.mjs",
		"vitest.config.mts",
		"**/dist/**/*",
		".e2e-test-report/**",
	]),
	{
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: "module",
			parserOptions: {
				project: true,
				projectService: true,
			},
		},

		plugins: {
			"unused-imports": unusedImports,
			"no-only-tests": noOnlyTests,
			"workers-sdk": {
				rules: {
					"no-unsafe-command-execution": noUnsafeCommandExecution,
				},
			},
		},
	},

	{
		files: ["**/*.ts", "**/*.mts", "**/*.tsx"],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
			importPlugin.flatConfigs.typescript,
			turbo.configs["flat/recommended"],
		],
		rules: {
			curly: ["error", "all"],
			"no-empty": "off",
			"no-empty-function": "off",
			"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
			"no-only-tests/no-only-tests": "error",
			"require-yield": "off",
			"@typescript-eslint/consistent-type-imports": ["error"],
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"no-shadow": "off",
			"@typescript-eslint/no-shadow": "error",
			"no-unused-vars": "off",

			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: ".*",
					varsIgnorePattern: "^_",
					ignoreRestSiblings: true,
				},
			],

			"import/enforce-node-protocol-usage": ["error", "always"],

			"unused-imports/no-unused-imports": "error",

			"unused-imports/no-unused-vars": [
				"error",
				{
					vars: "all",
					varsIgnorePattern: "^_",
					args: "after-used",
					argsIgnorePattern: "^_",
				},
			],
			"workers-sdk/no-unsafe-command-execution": "error",
		},
	},
	{
		files: [
			"**/*.test.ts",
			"**/*.test.mts",
			"**/*.test.tsx",
			"**/test/**/*.ts",
			"**/__tests__/**/*.ts",
			"**/__tests__/**/*.mts",
			"**/__tests__/**/*.tsx",
			"**/e2e/**/*.ts",
			"**/e2e/**/*.mts",
			"**/fixtures/**/*.ts",
			"**/fixtures/**/*.mts",
		],
		rules: {
			"workers-sdk/no-unsafe-command-execution": "off",
		},
	}
);
