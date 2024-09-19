import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-assets-only",
	path: "templates-experimental/hello-world-assets-only",
	displayName: "Hello World - Assets-only",
	description: "Get started with a basic Worker that only serves static assets",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
};

export default config;
