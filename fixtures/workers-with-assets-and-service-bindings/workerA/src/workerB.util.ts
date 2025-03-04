export async function getWorkerBResponses(request: Request, env) {
	let response: Response;

	// test fetch requests (includes both assets and User Worker routes)
	response = await env.DEFAULT_EXPORT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions with strictly one parameter
	response = await env.DEFAULT_EXPORT.bee(request);
	const beeResult = await response.text();

	// test named functions with multiple parameters
	// named functions with variable number of args are only supported for
	// Workers using the class-based syntax

	// tests Cron Triggers
	const scheduledRequest = new Request("http://fakehost/cdn-cgi/mf/scheduled");
	const scheduledResponse =
		await env.DEFAULT_EXPORT.scheduled(scheduledRequest);

	return {
		fetchResponse,
		beeResult,
		busyBeeResult:
			"Not supported. When calling a top-level handler function that is not declared as part of a class, you must always send exactly one argument. In order to support variable numbers of arguments, the server must use class-based syntax (extending WorkerEntrypoint) instead.",
		scheduledResponse,
	};
}
