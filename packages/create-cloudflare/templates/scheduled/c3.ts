export default {
	configVersion: 1,
	id: "scheduled",
	displayName: "Scheduled Worker (Cron Trigger)",
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
