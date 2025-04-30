import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "workflows-starter",
	displayName: "Workflow",
	description:
		"For multi-step applications with durable execution, that automatically retry",
	platform: "workers",
	copyFiles: { path: "./ts" },
} satisfies TemplateConfig;
