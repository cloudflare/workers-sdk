export async function getWorkerCResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.DEFAULT_ENTRYPOINT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions without parameters
	const beeResult = await env.DEFAULT_ENTRYPOINT.bee();

	// test named functions with parameters
	const busyBeeResult = await env.DEFAULT_ENTRYPOINT.busyBee("🐝");

	// tests Cron Triggers
	const scheduledResponse = await env.DEFAULT_ENTRYPOINT.scheduled({
		cron: "* * * * *",
	});

	return {
		fetchResponse,
		beeResult,
		busyBeeResult,
		scheduledResponse,
	};
}
