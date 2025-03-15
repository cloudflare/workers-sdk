interface Env {
	ASSETS: Fetcher;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Cloudflare",
			});
		}

		const response = await env.ASSETS.fetch(request);
		const newResponse = new Response(response.body, {
			...response,
			headers: { "CUSTOM-HEADER": "HERE!" },
		});
		return newResponse;
	},
} satisfies ExportedHandler<Env>;
