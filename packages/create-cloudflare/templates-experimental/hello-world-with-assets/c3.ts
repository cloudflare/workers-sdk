import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-with-assets",
	path: "templates-experimental/hello-world-with-assets",
	displayName: "Hello World - Worker with Assets",
	description:
		"Get started with a basic Worker that also serves static assets, in the language of your choice",
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
};
export default config;
