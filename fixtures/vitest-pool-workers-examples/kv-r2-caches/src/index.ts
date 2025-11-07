export async function handleKVRequest(request: Request, env: Env) {
	if (request.method === "GET") {
		const value = await env.KV_NAMESPACE.get(request.url, "stream");
		return new Response(value, { status: value === null ? 204 : 200 });
	} else if (request.method === "PUT") {
		await env.KV_NAMESPACE.put(request.url, request.body ?? "");
		return new Response(null, { status: 204 });
	} else {
		return new Response("Method Not Allowed", { status: 405 });
	}
}

export async function handleR2Request(
	request: Request,
	env: Env,
	ctx: ExecutionContext
) {
	if (request.method === "GET") {
		let response = await caches.default.match(request);
		if (response !== undefined) return response;

		const object = await env.R2_BUCKET.get(request.url);
		if (object === null) return new Response(null, { status: 204 });

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		response = new Response(object.body, { headers });

		ctx.waitUntil(caches.default.put(request, response.clone()));
		return response;
	} else if (request.method === "PUT") {
		await env.R2_BUCKET.put(request.url, request.body, {
			httpMetadata: request.headers,
		});
		return new Response(null, { status: 204 });
	} else {
		return new Response("Method Not Allowed", { status: 405 });
	}
}

export default (<ExportedHandler<Env>>{
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/kv/")) {
			return handleKVRequest(request, env);
		} else if (url.pathname.startsWith("/r2/")) {
			return handleR2Request(request, env, ctx);
		} else {
			return new Response("Not Found", { status: 404 });
		}
	},
});
