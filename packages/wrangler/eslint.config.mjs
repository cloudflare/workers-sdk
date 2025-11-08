import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

// TODO: add linting for `startDevWorker` workers in `templates/startDevWorker`

export default defineConfig([
	globalIgnores([
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"emitted-types",
		"kv-asset-handler.js",
		"**/templates/**/*.*",
	]),
	sharedConfig,
	{
		files: ["**/*.ts"],
		ignores: ["**/*.test.ts", "tsup.config.ts", "scripts/**", "e2e/**"],
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
]);
