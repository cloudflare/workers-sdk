export default {
	async fetch(request, env) {
		const fetchResponse = await env.WORKER_B.fetch(request);
		const addResult = await env.WORKER_B.add(40, 2);

		return new Response(
			`[env.WORKER_🐝.fetch()] returned: ${await fetchResponse.text()}\n` +
				`[env.WORKER_🐝.add(40, 2)] returned: ${addResult}`
		);
	},
};
