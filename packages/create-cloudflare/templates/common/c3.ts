export default {
	configVersion: 1,
	id: "common",
	displayName: "Example router & proxy Worker",
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
