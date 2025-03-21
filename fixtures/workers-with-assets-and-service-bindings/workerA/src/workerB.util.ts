export async function getWorkerBResponses(request: Request, env) {
	let response: Response;

	// test fetch requests (includes both assets and User Worker routes)
	response = await env.DEFAULT_EXPORT.fetch(request);
	const fetchResponse = await response.text();

	// test named functions without parameters
	// this is not supported in non-class based syntax
	const beeResult =
		"Workers in non-class based syntax do not support RPC functions with zero or variable number of arguments. They only support RPC functions with strictly one argument.";

	// test named functions with strictly one parameter
	const busyBeeResult = await env.DEFAULT_EXPORT.busyBee("🐝");

	// test properties
	const honeyResponse = await env.DEFAULT_EXPORT.honey;
	const honeyBeeResponse = await env.DEFAULT_EXPORT.honeyBee;

	// test nested functions + promise pipelining
	using foo = env.DEFAULT_EXPORT.foo("✨");
	const buzzResult = await foo.bar.buzz();

	// test RPCTarget + promise pipelining
	// this is not supported in non-class based syntax
	const beeCountResult =
		"RpcTarget is not supported in non-class based syntax Workers.";

	// tests Cron Triggers
	const scheduledResponse = await env.DEFAULT_EXPORT.scheduled({
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
