export default {
	configVersion: 1,
	id: "queues",
	displayName: "Queue consumer & producer Worker",
	description:
		"Process background tasks and message batches with Cloudflare Queues",
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
	bindings: {
		queues: [
			{
				boundVariable: "MY_QUEUE",
				defaultValue: "my-queue",
				producer: true,
				consumer: true,
			},
		],
	},
};
