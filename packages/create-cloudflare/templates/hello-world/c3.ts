export default {
	configVersion: 1,
	id: "hello-world",
	displayName: '"Hello World" Worker',
	platform: "workers",
	languages: ["js", "ts"],
	copyFiles: {
		js: {
			path: "./js",
		},
		ts: {
			path: "./ts",
		},
	},
};
