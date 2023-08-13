// Settings here should be considered Global ESLint settings for the monorepo. We don't need to define --config in each package.
// https://eslint.org/docs/latest/use/configure/
// https://eslint.org/docs/latest/use/configure/configuration-files#using-configuration-files
// This can be in the form of a .eslintrc.* file or an eslintConfig field in a package.json file,
// both of which ESLint will look for and read automatically, or you can specify a configuration file on the command line.
/** @type {import("eslint").Linter.Config} */
module.exports = {
	ignorePatterns: [
		"**/node_modules/**",
		"examples",
		"**/templates/**",
		".eslintrc.js",
		"**/dist/**",
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		project: true,
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
		},
<<<<<<< HEAD:.eslintrc.js
		{
			files: "packages/triangle/src/**/*.ts",
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
		"packages/triangle/vendor",
		"packages/triangle/*-dist",
		"packages/triangle/pages/functions/template-worker.ts",
		"packages/triangle/templates",
		"packages/triangle/emitted-types",
		"examples/remix-pages-app/public",
		"packages/jest-environment-triangle/dist",
		"packages/triangle-devtools/built-devtools",
		"packages/trianglejs-compat-webpack-plugin/lib",
		"/templates",
		"packages/quick-edit-extension/vscode*.d.ts",
		"packages/create-cloudflare/**/templates/**",
		"packages/create-cloudflare/dist",
		"packages/create-cloudflare/scripts",
=======
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/eslint-config-worker/index.js
	],
};
