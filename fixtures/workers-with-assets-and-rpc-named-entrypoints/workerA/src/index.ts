export default {
	async fetch(request, env) {
		const fetchResponse = await env.WORKER_B.fetch(request);
		const beeHiResponse = await env.WORKER_B.fetch(
			new URL("bee-hi.html", request.url)
		);
		const beeGreeting = await env.WORKER_B.beeHi();

		return new Response(
			`[env.WORKER_🐝.fetch()] returned: ${await fetchResponse.text()}\n` +
				`[env.WORKER_🐝.fetch(new URL("bee-hi.html", request.url)] returned: ${await beeHiResponse.text()}\n` +
				`[env.WORKER_🐝.beeHi()] returned: ${beeGreeting}\n`
		);
	},
};
