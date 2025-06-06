export type Env = {
	ASSETS: Fetcher;
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);

		// api routes
		if (pathname.startsWith("/api/")) {
			return Response.json({ some: ["json", "response"] });
		}

		// asset middleware
		const assetResp = await env.ASSETS.fetch(request);
		if (assetResp.ok) {
			let text = await assetResp.text();
			text = text.replace(
				"I'm an asset",
				"I'm an asset (and was intercepted by the User Worker)"
			);
			return new Response(text, {
				headers: assetResp.headers,
				status: assetResp.status,
			});
		}

		// default handling
		return new Response("404 from the User Worker", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
