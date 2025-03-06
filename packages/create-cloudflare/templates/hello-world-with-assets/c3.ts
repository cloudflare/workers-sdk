export default {
	configVersion: 1,
	id: "hello-world-with-assets",
	path: "templates/hello-world-with-assets",
	displayName: "Worker + Static Assets",
	description:
		"Get started with a basic Worker that also serves static assets, in the language of your choice",
	platform: "workers",
	copyFiles: {
		variants: {
			js: {
				path: "./js",
			},
			ts: {
				path: "./ts",
			},
			python: {
				path: "./py",
			},
		},
	},
};
