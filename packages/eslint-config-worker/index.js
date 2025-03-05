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
		"**/templates/**/*.*",
		".eslintrc.*js",
		"**/dist/**",
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		project: true,
	},
	plugins: ["@typescript-eslint", "import", "unused-imports", "no-only-tests"],
	extends: ["plugin:turbo/recommended"],
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			extends: [
				"eslint:recommended",
				"plugin:@typescript-eslint/recommended",
				"plugin:import/typescript",
				"plugin:turbo/recommended",
			],

			rules: {
				curly: ["error", "all"],
				"no-empty": "off",
				"no-empty-function": "off",
				"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
				"no-only-tests/no-only-tests": "error",
				"require-yield": "off",
				"@typescript-eslint/consistent-type-imports": ["error"],
				"@typescript-eslint/no-empty-function": "off",
				"@typescript-eslint/no-explicit-any": "error",
				"@typescript-eslint/no-floating-promises": "error",
				"@typescript-eslint/no-non-null-assertion": "error",
				"no-shadow": "off",
				"@typescript-eslint/no-shadow": "error",
				"no-unused-vars": "off",
				"@typescript-eslint/no-unused-vars": [
					"error",
					{
						argsIgnorePattern: ".*",
						varsIgnorePattern: "^_",
						ignoreRestSiblings: true,
					},
				],
				"unused-imports/no-unused-imports": "error",
				"unused-imports/no-unused-vars": [
					"error",
					{
						vars: "all",
						varsIgnorePattern: "^_",
						args: "after-used",
						argsIgnorePattern: "^_",
					},
				],
			},
		},
	],
};
