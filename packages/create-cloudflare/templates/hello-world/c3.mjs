export default {
	configVersion: 1,
	id: "hello-world",
	displayName: "Hello World Worker",
	description: "Get started with a basic Worker in the language of your choice",
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
