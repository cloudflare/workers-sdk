import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "workflows-starter",
	displayName: "Workflow",
	description:
		"For multi-step applications, that automatically retry, persist state and run for minutes, hours, days or weeks",
	platform: "workers",
	copyFiles: { path: "./ts" },
} satisfies TemplateConfig;
