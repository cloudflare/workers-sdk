export default {
	configVersion: 1,
	id: "hello-world-durable-object",
	displayName: "Hello World Worker Using Durable Objects",
	description:
		"Get started with a basic stateful app to build projects like real-time chats, collaborative apps, and multiplayer games",
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
