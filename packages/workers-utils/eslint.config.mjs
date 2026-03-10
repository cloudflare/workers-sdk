import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores(["vendor", "*-dist", "emitted-types", "**/templates/**/*.*"]),
	sharedConfig,
	{
		files: ["**/*.ts"],
		ignores: ["**/*.test.ts", "tsup.config.ts", "e2e/**"],
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
	{
		files: ["**/*.test.ts"],
		rules: {
			"workers-sdk/no-vitest-import-expect": "error",
		},
	},
]);
