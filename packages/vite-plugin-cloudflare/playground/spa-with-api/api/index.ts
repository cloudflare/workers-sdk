interface Env {
	ASSETS: Fetcher;
}

export default {
	fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Cloudflare",
			});
		}

		return new Response("nothing here", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
