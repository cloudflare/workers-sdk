export async function getWorkerDResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.NAMED_ENTRYPOINT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions without parameters
	const beeResult = await env.NAMED_ENTRYPOINT.bee();

	// test named functions with parameters
	const busyBeeResult = await env.NAMED_ENTRYPOINT.busyBee("🐝");

	// test nested functions + promise pipelining
	const foo = env.DEFAULT_ENTRYPOINT.foo("🐙");
	const buzzResult = await foo.bar.buzz();

	// test RpcTarget + promise pipelining
	const beeCounter = await env.DEFAULT_ENTRYPOINT.newBeeCounter();
	beeCounter.increment(1); // returns 1
	beeCounter.increment(2); // returns 3
	beeCounter.increment(-1); // returns 2
	const beeCountResult = await beeCounter.value; // returns 2

	// tests Cron Triggers
	// Cron Triggers can only be defined on default exports, class-based or otherwise

	return {
		fetchResponse,
		beeResult,
		busyBeeResult,
		buzzResult,
		beeCountResult,
		scheduledResponse:
			"Not supported. Cron Triggers can only be defined on default exports.",
	};
}
