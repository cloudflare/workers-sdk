module.exports = {
	parser: "@typescript-eslint/parser",
	extends: ["plugin:prettier/recommended"],
	plugins: ["import", "es"],
	rules: {
		"no-undef-init": "off",
		"prettier/prettier": "off",
		"no-console": "error",
	},
	overrides: [
		{
			files: ["*.ts"],
			excludedFiles: ["*.js", "*.mjs"],
			extends: ["plugin:@typescript-eslint/recommended"],
			rules: {
				"@typescript-eslint/ban-ts-comment": "off",
				"@typescript-eslint/no-empty-function": "off",
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/no-non-null-assertion": "error",
				"@typescript-eslint/no-require-imports": "off",
				"@typescript-eslint/no-unused-vars": [
					"warn",
					{ argsIgnorePattern: "^_" },
				],
				"es/no-dynamic-import": "error",
			},
		},
		{
			files: ["src/workers/**/*.ts", "scripts/**"],
			rules: { "no-console": "off" },
		},
	],
};
