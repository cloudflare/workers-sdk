import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-durable-object-with-assets",
	path: "templates/hello-world-durable-object-with-assets",
	displayName: "Worker + Durable Objects + Assets",
	description:
		"For full-stack applications requiring static assets, an API, and real-time coordination",
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
};

export default config;
