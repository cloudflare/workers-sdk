/** @type {import("eslint").Linter.Config} */
module.exports = {
	extends: ["plugin:turbo/recommended", "@cloudflare/eslint-config-worker"],
	plugins: ["eslint-plugin-react", "eslint-plugin-react-hooks"],
	overrides: [
		{
			files: ["**/*.ts", "**/*.tsx"],
			extends: [
				"plugin:react/recommended",
				"plugin:react/jsx-runtime",
				"plugin:react-hooks/recommended",
			],
		},
	],
	settings: {
		react: {
			version: "detect",
		},
	},
};
