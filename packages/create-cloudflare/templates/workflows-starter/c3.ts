import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "workflow-starter",
	displayName: "Workflow",
	description:
		"For multi-step applications with durable execution, that automatically retry",
	platform: "workers",
	copyFiles: { path: "./ts" },
};
export default config;
