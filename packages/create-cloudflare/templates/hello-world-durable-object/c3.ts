export default {
	configVersion: 1,
	id: "hello-world-durable-object",
	displayName: "Hello World Worker Using Durable Objects",
	description:
		"[Requires paid plan] Create a multiplayer application starter to collaborate between clients and players",
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
