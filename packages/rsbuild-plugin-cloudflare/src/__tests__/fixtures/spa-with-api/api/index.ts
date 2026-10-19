interface Env {
	ASSETS: Fetcher;
}

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (pathname === "/api/hello") {
			return Response.json({ name: "Cloudflare" });
		}

		const response = await env.ASSETS.fetch(
			new URL("/index.html", request.url)
		);
		return new Response(response.body, {
			headers: { "content-type": "text/html", "x-from-worker": "true" },
		});
	},
} satisfies ExportedHandler<Env>;
