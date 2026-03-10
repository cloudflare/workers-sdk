import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores(["scripts/rtti/rtti.*", "src/mock-agent/**"]),
	sharedConfig,
	{
		files: ["src/worker/**/*.ts"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "src/worker/tsconfig.json",
			},
		},
	},
	{
		files: ["types/**/*.ts"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "types/tsconfig.json",
			},
		},
	},
	{
		files: ["test/**/vitest.config.*ts"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "tsconfig.json",
			},
		},
	},
	{
		files: ["test/**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
