import type { TemplateConfig } from "../../src/templates";

const config: TemplateConfig = {
	configVersion: 1,
	id: "hello-world-durable-object-with-assets",
	path: "templates-experimental/hello-world-durable-object-with-assets",
	displayName: "Hello World - Worker Using Durable Objects with Assets",
	description:
		"Get started with a basic stateful app to build projects like real-time chats, collaborative apps, and multiplayer games, which hosts assets",
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
