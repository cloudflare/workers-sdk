module.exports = {
	parser: "@typescript-eslint/parser",
	extends: ["plugin:prettier/recommended"],
	plugins: ["import", "es"],
	rules: {
		"import/order": ["warn", { alphabetize: { order: "asc" } }],
		"no-undef-init": "off",
		"sort-imports": ["warn", { ignoreDeclarationSort: true }],
		"prettier/prettier": "off"
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
				"@typescript-eslint/no-var-requires": "off",
				"@typescript-eslint/no-unused-vars": [
					"warn",
					{ argsIgnorePattern: "^_" },
				],
				"es/no-dynamic-import": "error",
			},
		},
	],
};
