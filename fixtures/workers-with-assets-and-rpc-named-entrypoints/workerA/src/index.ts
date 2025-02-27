export default {
	async fetch(request, env) {
		let response: Response;

		// test fetch requests (includes both assets and User Worker routes)
		response = await env.WORKER_B.fetch(request);
		const fetchResponse = await response.text();

		// test named functions without params
		const beeResult = await env.WORKER_B.bee();

		// test named functions with params
		const busyBeeResult = await env.WORKER_B.busyBee("🐝");

		//  tests Cron Triggers
		const scheduledRequest = new Request(
			"http://fakehost/cdn-cgi/mf/scheduled"
		);
		const scheduledResponse = await env.WORKER_B.scheduled(scheduledRequest);

		// let's return everything for now to make testing easier
		return new Response(
			`env.WORKER_B.fetch() response: ${fetchResponse}\n` +
				`env.WORKER_B.bee() response: ${beeResult}\n` +
				`env.WORKER_B.busyBee("🐝") response: ${busyBeeResult}\n` +
				`env.WORKER_B.scheduled() response: ${scheduledResponse}\n`
		);
	},
};
