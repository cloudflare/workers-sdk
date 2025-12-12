import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores(["**/dist", "**/e2e"]),
	{
		extends: [sharedConfig],
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
]);
