export default {
	configVersion: 1,
	id: "kv",
	displayName: "Worker with KV",
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
