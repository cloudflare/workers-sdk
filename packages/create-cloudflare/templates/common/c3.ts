import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "common",
	displayName: "Example router & proxy Worker",
	description:
		"Create a Worker to route and forward requests to other services",
	platform: "workers",
	hidden: true,
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
