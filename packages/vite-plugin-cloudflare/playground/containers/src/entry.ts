interface Env {
	DOCKERFILE_APP: Fetcher;
	REGISTRY_APP: Fetcher;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		// Route by path prefix to the appropriate aux worker. The prefix is
		// stripped before the request is forwarded, so the aux worker sees
		// the original container path (e.g. `/start`, `/fetch`).
		let service: Fetcher | undefined;
		let prefix = "";
		if (
			url.pathname === "/dockerfile" ||
			url.pathname.startsWith("/dockerfile/")
		) {
			service = env.DOCKERFILE_APP;
			prefix = "/dockerfile";
		} else if (
			url.pathname === "/registry" ||
			url.pathname.startsWith("/registry/")
		) {
			service = env.REGISTRY_APP;
			prefix = "/registry";
		}

		if (!service) {
			return new Response(
				"Not found. Use `/dockerfile/...` or `/registry/...`.",
				{ status: 404 }
			);
		}

		const forwardedUrl = new URL(url);
		forwardedUrl.pathname = url.pathname.slice(prefix.length) || "/";
		return service.fetch(new Request(forwardedUrl.toString(), request));
	},
} satisfies ExportedHandler<Env>;
