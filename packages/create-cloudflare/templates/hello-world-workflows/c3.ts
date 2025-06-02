import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "hello-world-workflows",
	displayName: "Workflow",
	description:
		"For multi-step applications that automatically retry, persist state, and run for minutes, hours, days or weeks",
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
} satisfies TemplateConfig;
