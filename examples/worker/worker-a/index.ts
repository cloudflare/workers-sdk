export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const result = await env.WORKER_B.add(4, 5);

		return Response.json({
			name: 'Worker A',
			pathname: url.pathname,
			worker_b_rpc_result: result,
		});
	},
} satisfies ExportedHandler<Env>;
