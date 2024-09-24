export default {
	configVersion: 1,
	id: "hello-world-with-assets",
	path: "templates-experimental/hello-world-with-assets",
	displayName: "Hello World - Worker with Assets",
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
