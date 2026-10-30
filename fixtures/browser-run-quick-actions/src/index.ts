export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		const url = searchParams.get("url");
		const html = searchParams.get("html");
		const target = url ? { url } : html ? { html } : undefined;
		if (!target) {
			return new Response(
				"Please add an ?url=https://example.com/ or ?html=<h1>Hello</h1> parameter"
			);
		}

		switch (searchParams.get("action")) {
			case "screenshot":
				return env.MYBROWSER.quickAction("screenshot", target);
			case "pdf":
				return env.MYBROWSER.quickAction("pdf", target);
			case "links":
				return env.MYBROWSER.quickAction("links", target);
			case "content":
				return env.MYBROWSER.quickAction("content", target);
			case "snapshot":
				return env.MYBROWSER.quickAction("snapshot", target);
			case "accessibilityTree":
				return env.MYBROWSER.quickAction("accessibilityTree", target);
			case "scrape":
				return env.MYBROWSER.quickAction("scrape", {
					...target,
					elements: [{ selector: searchParams.get("selector") ?? "h1" }],
				});
			case "json":
				return env.MYBROWSER.quickAction("json", {
					...target,
					prompt: searchParams.get("prompt") ?? "Get the page heading",
					response_format: {
						type: "json_schema",
						json_schema: {
							type: "object",
							properties: { heading: { type: "string" } },
						},
					},
				});
			default:
				return env.MYBROWSER.quickAction("markdown", target);
		}
	},
} satisfies ExportedHandler<Env>;
