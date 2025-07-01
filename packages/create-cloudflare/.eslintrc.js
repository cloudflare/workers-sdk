module.exports = {
	root: true,
	extends: ["@cloudflare/eslint-config-worker"],
	ignorePatterns: [
		"dist",
		"scripts",
		"e2e/**/fixtures/**",
		"**/templates*/**/*.*",
		// template files are ignored by the eslint-config-worker configuration
		// we do however want the c3 files to be linted
		"!**/templates*/**/c3.ts",
	],
};
