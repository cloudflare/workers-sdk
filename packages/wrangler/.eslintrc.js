module.exports = {
	root: true,
	extends: ["@cloudflare/eslint-config-worker"],
	ignorePatterns: [
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"templates",
		"emitted-types",
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
