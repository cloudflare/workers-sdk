import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-durable-object",
	displayName: "Worker + Durable Objects",
	description:
		"For multiplayer apps using WebSockets, or when you need synchronization",
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
