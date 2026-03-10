import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

// src/client/** is a generated client that we shouldn't lint
export default defineConfig([
	globalIgnores(["src/client/**"]),
	sharedConfig,
	{
		files: ["tests/**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
