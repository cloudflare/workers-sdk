export function greet(request: Request): string {
	return `👋 ${request.url}`;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/api/date") {
			return new Response(new Date().toISOString());
		}

		if (url.pathname === "/binding") {
			const response = await env.ASSETS.fetch(request);
			return new HTMLRewriter()
				.on("h1", {
					element(element) {
						element.setInnerContent("Intercept!");
					},
				})
				.transform(response);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<{ ASSETS: Fetcher }>;
