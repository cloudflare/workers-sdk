// Use this ESLint config as @cloudflare/eslint-config-shared/react for React projects
/** @type {import("eslint").Linter.Config} */
module.exports = {
	extends: ["plugin:turbo/recommended", "./base.js"],
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
