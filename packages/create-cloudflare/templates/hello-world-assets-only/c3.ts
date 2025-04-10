import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-assets-only",
	path: "templates/hello-world-assets-only",
	displayName: "Static site",
	description:
		"For static sites or when using your own backend. Uses Workers Static Assets.",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
};

export default config;
