export default {
	async fetch(request, env, ctx) {
		const response = await env.WORKER_B.fetch(request);
		const text = await response.text();

		console.log(text);

		return new Response(
			`This is Worker B. The response from Worker A is "${text}".`
		);
	},
} satisfies ExportedHandler<Env>;
