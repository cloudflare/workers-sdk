import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-assets-only",
	path: "templates/hello-world-assets-only",
	displayName: "Assets only",
	description:
		"For static sites (including SPAs) or when using your own backend",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
};

export default config;
