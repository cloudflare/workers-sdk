import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "scheduled",
	displayName: "Scheduled Worker (Cron Trigger)",
	description:
		"Create a Worker to be executed on a schedule for periodic (cron) jobs",
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

export default config;
