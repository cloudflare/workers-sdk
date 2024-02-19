export default {
	configVersion: 1,
	id: "scheduled",
	displayName: "Scheduled Worker (Cron Trigger)",
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
