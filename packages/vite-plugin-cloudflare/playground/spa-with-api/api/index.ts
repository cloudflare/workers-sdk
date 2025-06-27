import assetPath from "./asset.txt?no-inline";

interface Env {
	ASSETS: Fetcher;
}

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (pathname.startsWith("/api/")) {
			if (pathname === "/api/asset") {
				const response = await env.ASSETS.fetch(
					new URL(assetPath, request.url)
				);
				const text = await response.text();

				return new Response(`Modified: ${text}`);
			}

			return Response.json({
				name: "Cloudflare",
			});
		}

		const response = await env.ASSETS.fetch(request);
		const modifiedResponse = new Response(response.body, response);
		modifiedResponse.headers.append("is-worker-response", "true");

		return modifiedResponse;
	},
} satisfies ExportedHandler<Env>;
