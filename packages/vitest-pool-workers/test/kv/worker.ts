export function transformResponse(response: Response): Response {
	return new HTMLRewriter()
		.on("a", {
			element(element) {
				const href = element.getAttribute("href");
				if (href !== null) {
					element.setAttribute("href", href.replace("http://", "https://"));
				}
			},
		})
		.transform(response);
}

export default {
	async fetch(request, _env, _ctx) {
		return new Response(`body:${request.url}`);
	},
} satisfies ExportedHandler<CloudflareTestEnv>;
