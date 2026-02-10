import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "hello-world",
	displayName: "Worker only",
	description:
		"For processing requests, transforming responses, or API endpoints",
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
} satisfies TemplateConfig;
