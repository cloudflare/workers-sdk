import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores(["**/dist-types", "src/runtime/config/workerd.*"]),
	{
		extends: [sharedConfig],
		rules: {
			"no-console": "error",
		},
	},
	{
		files: ["src/workers/**/*.ts", "scripts/**"],
		rules: {
			"no-console": "off",
		},
	},
	// Enable no-vitest-import-expect for test files
	{
		files: ["**/*.spec.ts", "**/test/**/*.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
	// Rules following this are temporarily enabled while we transition Miniflare to use the standard workers-sdk eslint config
	// TODO: fix instances of these rules and remove them
	{
		files: ["**/*.ts"],
		rules: {
			curly: "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/consistent-type-imports": "off",
			"turbo/no-undeclared-env-vars": "off",
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-floating-promises": "off",
			"no-useless-escape": "off",
			"no-unsafe-optional-chaining": "off",
			"no-control-regex": "off",
			"no-case-declarations": "off",
			"no-empty-pattern": "off",
		},
	},
]);
