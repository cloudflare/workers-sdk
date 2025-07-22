module.exports = {
	root: true,
	extends: ["plugin:turbo/recommended", "@cloudflare/eslint-config-worker"],
	ignorePatterns: [
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"templates",
		"emitted-types",
		"e2e/seed-files/**/*",
		"kv-asset-handler.js",
	],
	overrides: [
		{
			// TODO: add linting for `startDevWorker` workers in `templates/startDevWorker`
			files: "src/**/*.ts",
			excludedFiles: "*.test.ts",
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: true,
			},
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
				],
			},
		},
	],
};
