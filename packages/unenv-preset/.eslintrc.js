module.exports = {
	root: true,
	extends: ["plugin:turbo/recommended", "@cloudflare/eslint-config-worker"],
	ignorePatterns: ["/dist", "/runtime"],
};
