import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig } from "eslint/config";

export default defineConfig([
	sharedConfig,
	{
		files: ["tests/**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
