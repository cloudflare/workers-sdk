export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case '/fetch': {
				const response = await env.WORKER_B.fetch(request);
				const result = await response.json();

				return Response.json({
					result,
				});
			}
			case '/rpc-method': {
				const result = await env.WORKER_B.add(4, 5);

				return Response.json({
					result,
				});
			}
			case '/rpc-getter': {
				const result = await env.WORKER_B.name;

				return Response.json({ result });
			}
			case '/rpc-named-entrypoint': {
				const result = await env.NAMED_ENTRYPOINT.multiply(4, 5);

				return Response.json({ result });
			}
			default: {
				throw new Error('Unhandled path');
			}
		}
	},
} satisfies ExportedHandler<any>;
