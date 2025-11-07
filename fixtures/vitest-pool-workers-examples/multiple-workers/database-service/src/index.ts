export default (<ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (request.method === "GET") {
			const value = await env.KV_NAMESPACE.get(pathname, "stream");
			return new Response(value, { status: value === null ? 204 : 200 });
		} else if (request.method === "PUT") {
			await env.KV_NAMESPACE.put(pathname, request.body ?? "");
			return new Response(null, { status: 204 });
		} else {
			return new Response("Method Not Allowed", { status: 405 });
		}
	},
});
