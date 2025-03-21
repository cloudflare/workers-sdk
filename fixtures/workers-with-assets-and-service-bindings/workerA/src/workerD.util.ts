export async function getWorkerDResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.NAMED_ENTRYPOINT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions without parameters
	const beeResult = await env.NAMED_ENTRYPOINT.bee();

	// test named functions with parameters
	const busyBeeResult = await env.NAMED_ENTRYPOINT.busyBee("🐝");

	// tests Cron Triggers
	// Cron Triggers can only be defined on default exports, class-based or otherwise

	return {
		fetchResponse,
		beeResult,
		busyBeeResult,
		scheduledResponse:
			"Not supported. Cron Triggers can only be defined on default exports.",
	};
}
