module.exports = {
	root: true,
	extends: ["plugin:turbo/recommended", "@cloudflare/eslint-config-shared"],
	ignorePatterns: ["dist"],
	overrides: [
		{
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
