module.exports = {
	root: true,
	extends: ["@cloudflare/eslint-config-worker"],
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		project: "tsconfig.json",
	},
	overrides: [
		{
			files: "src/worker/**/*.ts",
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "src/worker/tsconfig.json",
			},
		},
		{
			files: "test/**/*.ts",
			excludedFiles: "test/*/vitest.config.ts",
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "test/tsconfig.json",
			},
		},
	],
};
