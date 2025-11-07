export default (<ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		// Forward login requests to the auth service
		if (url.pathname === "/login") return env.AUTH_SERVICE.fetch(request);

		// Verify the user's token with the auth service...
		const verifyResponse = await env.AUTH_SERVICE.fetch(
			"http://placeholder/verify",
			{ method: "POST", headers: request.headers }
		);

		if (!verifyResponse.ok) return verifyResponse;

		// ...then prefix the path with the username and forward to database service
		const payload = await verifyResponse.json<{
			"urn:example:username": string;
		}>();
		const username = payload["urn:example:username"];
		url.pathname = `/${username}${url.pathname}`;
		return env.DATABASE_SERVICE.fetch(url, request);
	},
});
