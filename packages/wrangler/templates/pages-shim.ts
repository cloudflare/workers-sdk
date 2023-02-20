// This Worker is used as a default when no Pages Functions are present.
// It proxies the request directly on to the asset server binding.

export default <ExportedHandler<{ ASSETS: Fetcher }>>{
	async fetch(request, env, context) {
		// @ts-expect-error due to a bug in `@cloudflare/workers-types`, the `cf`
		//  types from the `request` parameter and `RequestInit` are incompatible.
		//  We'll get this fixed very soon.
		const response = await env.ASSETS.fetch(request.url, request);
		return new Response(response.body, response);
	},
};
