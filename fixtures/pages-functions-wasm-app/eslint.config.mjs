import noVitestImportExpect from "@cloudflare/eslint-config-shared/rules/no-vitest-import-expect";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		files: [
			"**/*.test.ts",
			"**/*.spec.ts",
			"**/test/**/*.ts",
			"**/tests/**/*.ts",
		],
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
]);
