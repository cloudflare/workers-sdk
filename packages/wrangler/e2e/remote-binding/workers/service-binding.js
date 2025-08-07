export default {
	async fetch(request, env) {
		return Response.json({
			default: await (await env.SERVICE.fetch("http://example.com")).text(),
			entrypoint: await (
				await env.SERVICE_WITH_ENTRYPOINT.fetch("http://example.com")
			).text(),
			rpc: await env.SERVICE_WITH_ENTRYPOINT.add(1, 2),
		});
	},
};
