export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const count = (await env.MY_KV.get('KEY')) ?? '0';
		await env.MY_KV.put('KEY', `${Number(count) + 1}`);

		return Response.json({
			name: 'Worker B',
			message: `The count is ${count}`,
			pathname: url.pathname,
		});
	},
} satisfies ExportedHandler<Env>;
