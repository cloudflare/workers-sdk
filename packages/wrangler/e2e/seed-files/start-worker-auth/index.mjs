const { unstable_startWorker } = await import(process.env.WRANGLER_IMPORT);

const worker = await unstable_startWorker({
	entrypoint: "./worker.js",
	bindings: {
		AI: {
			type: "ai",
		},
	},
	dev: {
		auth: {
			accountId: process.env._START_WORKER_TESTING_AUTH_ID,
			apiToken: {
				apiToken: process.env._START_WORKER_TESTING_AUTH_TOKEN,
			},
		},
	},
});

console.log(
	`worker response: ${await (await worker.fetch("http://example.com")).text()}`
);

await worker.dispose();
