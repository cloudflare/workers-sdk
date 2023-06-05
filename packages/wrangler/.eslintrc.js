module.exports = {
	root: true,
	extends: ["worker"],
	ignorePatterns: [
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"templates",
		"emitted-types",
	],
};
