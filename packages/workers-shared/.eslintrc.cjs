/** @type {import("eslint").Linter.Config} */
module.exports = {
	root: true,
	extends: ["@cloudflare/eslint-config-worker"],
	parserOptions: {
		project: [
			"./tsconfig.json",
			"./tsconfig.package.json",
			"./tsconfig.scripts.json",
			"./tsconfig.tests.json",
		],
	},
};
