export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const response = await env.WORKER_B.fetch(request);
		const workerBJson = (await response.json()) as any;

		return Response.json({
			name: 'Worker A',
			worker_b_message: workerBJson.message,
			pathname: url.pathname,
		});
	},
} satisfies ExportedHandler<Env>;
