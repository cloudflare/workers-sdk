export default (<ExportedHandler>{
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		url.host = "cloudflare.com";
		try {
			return await fetch(url, request);
		} catch (e) {
			return new Response(String(e), { status: 500 });
		}
	},
});
