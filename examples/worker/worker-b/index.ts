export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const response = await env.WORKER_B.fetch(request);
		const workerAJson = (await response.json()) as any;

		return Response.json({
			name: 'Worker B',
			worker_a_message: workerAJson.message,
			pathname: url.pathname,
		});
	},
} satisfies ExportedHandler<Env>;
