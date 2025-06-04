export async function getWorkerCResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.DEFAULT_ENTRYPOINT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions without parameters
	const beeResult = await env.DEFAULT_ENTRYPOINT.bee();

	// test named functions with parameters
	const busyBeeResult = await env.DEFAULT_ENTRYPOINT.busyBee("🐝");

	// test properties
	const honeyResponse = await env.DEFAULT_ENTRYPOINT.honey;
	const honeyBeeResponse = await env.DEFAULT_ENTRYPOINT.honeyBee;

	// test nested functions + promise pipelining
	const foo = env.DEFAULT_ENTRYPOINT.foo("🐜");
	const buzzResult = await foo.bar.buzz();

	// test RpcTarget + promise pipelining
	using beeCounter = env.DEFAULT_ENTRYPOINT.newBeeCounter();
	beeCounter.increment(1); // returns 1
	beeCounter.increment(2); // returns 3
	beeCounter.increment(-1); // returns 2
	const beeCountResult = await beeCounter.value; // returns 2

	// tests Cron Triggers
	const scheduledResponse = await env.DEFAULT_ENTRYPOINT.scheduled({
		cron: "* * * * *",
	});

	return {
		fetchResponse,
		beeResult,
		busyBeeResult,
		honeyResponse,
		honeyBeeResponse,
		buzzResult,
		beeCountResult,
		scheduledResponse,
	};
}
