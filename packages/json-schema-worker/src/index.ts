export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const matches = url.pathname.match(/\/(.*?)\.json/);
		if (matches) {
			const branch = matches[1];
			return Response.json(await env.Schema.get(branch, "json"));
		} else {
			return new Response(null, { status: 404 });
		}
	},
};
