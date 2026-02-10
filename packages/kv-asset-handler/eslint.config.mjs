import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		extends: [sharedConfig],
	},
	// Enable no-vitest-import-expect for test files
	{
		files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
