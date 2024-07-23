export default {
	configVersion: 1,
	id: "hello-world",
	displayName: "Hello World Worker",
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
