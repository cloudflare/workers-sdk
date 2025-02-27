export default {
	async fetch(request, env) {
		let response: Response;

		// test fetch requests (includes both assets and User Worker routes)
		response = await env.WORKER_B.fetch(request);
		const fetchResponse = await response.text();

		// test named functions
		response = await env.WORKER_B.foo(request);
		const fooResponse = await response.text();

		// tests Cron Triggers
		const scheduledRequest = new Request(
			"http://fakehost/cdn-cgi/mf/scheduled"
		);
		response = await env.WORKER_B.scheduled(scheduledRequest);
		const scheduledResponse = await response.text();

		// let's return everything for now to make testing easier
		return new Response(
			`env.WORKER_B.fetch() response: ${fetchResponse}\n` +
				`env.WORKER_B.foo() response: ${fooResponse}\n` +
				`env.WORKER_B.scheduled() response: ${scheduledResponse}\n`
		);
	},
};
