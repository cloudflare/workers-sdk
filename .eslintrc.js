const fs = require("fs");
const path = require("path");

function* walkTsConfigs(root) {
	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === "node_modules") continue; // Ignore `node_modules`s
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walkTsConfigs(entryPath);
		} else if (entry.name === "tsconfig.json") {
			yield entryPath;
		}
	}
}

module.exports = {
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2020,
		project: Array.from(walkTsConfigs(__dirname)),
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
	],
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			extends: [
				"eslint:recommended",
				"plugin:@typescript-eslint/recommended",
				"plugin:react/recommended",
				"plugin:react-hooks/recommended",
				"plugin:import/typescript",
			],
			rules: {
				"no-empty": "off",
				"no-empty-function": "off",
				"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
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
		"packages/wrangler/vendor",
		"packages/wrangler/*-dist",
		"packages/wrangler/pages/functions/template-worker.ts",
		"packages/wrangler/templates",
		"packages/wrangler/emitted-types",
		"examples/remix-pages-app/public",
		"packages/jest-environment-wrangler/dist",
		"packages/wrangler-devtools/built-devtools",
		"packages/wranglerjs-compat-webpack-plugin/lib",
	],
	root: true,
};
