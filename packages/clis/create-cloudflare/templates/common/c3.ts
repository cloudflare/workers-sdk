export default {
	configVersion: 1,
	id: "common",
	displayName: "Example router & proxy Worker",
	platform: "workers",
	copyFiles: {
		variants: {
			js: {
				path: "./js",
			},
			ts: {
				path: "./ts",
			},
		},
	},
};
