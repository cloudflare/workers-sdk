// Use this ESLint config as @cloudflare/eslint-config-shared for Node projects
/** @type {import("eslint").Linter.Config} */
module.exports = {
	extends: ["./base.js"],
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			rules: {
				"no-restricted-globals": [
					"error",
					{
						name: "fetch",
						message: "Use undici's fetch instead",
					},
				],
			},
		},
	],
};
