module.exports = {
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2020,
		// project: __dirname, // Root eslint config in each package is responsible for this
		sourceType: "module",
	},
	settings: {
		react: {
			version: "detect",
		},
	},
	plugins: [
		"@typescript-eslint",
		"eslint-plugin-react",
		"eslint-plugin-react-hooks",
		"import",
		"unused-imports",
		"no-only-tests",
	],
	extends: ["turbo"],
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			extends: [
				"eslint:recommended",
				"plugin:@typescript-eslint/recommended",
				"plugin:react/recommended",
				"plugin:react-hooks/recommended",
				"plugin:import/typescript",
				"turbo",
			],
			rules: {
				"no-empty": "off",
				"no-empty-function": "off",
				"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
				"no-only-tests/no-only-tests": "error",
				"no-shadow": "error",
				"require-yield": "off",
				"@typescript-eslint/consistent-type-imports": ["error"],
				"@typescript-eslint/no-empty-function": "off",
				"@typescript-eslint/no-explicit-any": "error",
				"@typescript-eslint/no-floating-promises": "error",
				"@typescript-eslint/no-unused-vars": "off",
				"import/order": [
					"warn",
					{
						groups: [
							"builtin",
							"external",
							"internal",
							"parent",
							"sibling",
							"index",
							"object",
							"type",
						],
						alphabetize: {
							order: "asc",
						},
					},
				],
				"unused-imports/no-unused-imports": "error",
				"unused-imports/no-unused-vars": [
					"warn",
					{
						vars: "all",
						varsIgnorePattern: "^_",
						args: "after-used",
						argsIgnorePattern: "^_",
					},
				],
			},
			parserOptions: {
				project: ["./tsconfig.json"], // Specify it only for TypeScript files
			},
		},
		{
			files: "packages/wrangler/src/**/*.ts",
			excludedFiles: "*.test.ts",
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
	ignorePatterns: [
		"wrangler/vendor",
		"wrangler/*-dist",
		"wrangler/pages/functions/template-worker.ts",
		"wrangler/templates",
		"wrangler/emitted-types",
		"examples/remix-pages-app/public",
		"jest-environment-wrangler/dist",
		"wrangler-devtools/built-devtools",
		"wranglerjs-compat-webpack-plugin/lib",
		"/templates",
		"quick-edit-extension/vscode*.d.ts",
		"create-cloudflare/**/templates/**",
		"create-cloudflare/dist",
		"create-cloudflare/scripts",
	],
};
