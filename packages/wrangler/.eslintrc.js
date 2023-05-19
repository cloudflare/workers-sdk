module.exports = {
	root: true,
	extends: ["eslint-worker-config"],
	ignorePatterns: [
		"vendor",
		"*-dist",
		"pages/functions/template-worker.ts",
		"templates",
		"emitted-types",
	],
};
