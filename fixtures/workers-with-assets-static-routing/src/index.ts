export type Env = {
	ASSETS: Fetcher;
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
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
		return new Response("Hello from the User Worker");
	},
} satisfies ExportedHandler<Env>;
