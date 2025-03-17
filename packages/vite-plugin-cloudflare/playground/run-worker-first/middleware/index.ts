interface Env {
	ASSETS: Fetcher;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// Protect assets in the `/admin` directory from "unauthorized" access!
		if (url.pathname.startsWith("/admin")) {
			const auth = url.searchParams.get("auth");
			if (!auth) {
				return new Response("Unauthorized access", { status: 401 });
			}
		}

		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Cloudflare",
			});
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
