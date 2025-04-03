export default {
	async fetch(request, env, ctx) {
		await env.PIPELINE.send([
			{
				method: request.method.toUpperCase(),
				url: request.url,
			},
		]);
		return new Response("Accepted", { status: 202 });
	},
} satisfies ExportedHandler<Env>;
