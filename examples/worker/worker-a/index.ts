export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const fetchResponse = await env.WORKER_B.fetch(request);
		const fetchResult = await fetchResponse.json();
		const rpcResult = await env.WORKER_B.add(4, 5);

		return Response.json({
			name: 'Worker A',
			pathname: url.pathname,
			worker_b_fetch_result: fetchResult,
			worker_b_rpc_result: rpcResult,
		});
	},
} satisfies ExportedHandler<Env>;
