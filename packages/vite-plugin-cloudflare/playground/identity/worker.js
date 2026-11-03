// Protocol fixture only. Real applications own authenticated sessions and CSRF checks.
const sessionId = "vite-protocol-fixture-session-1234567890";
export default {
	async fetch(request, env) {
		const path = new URL(request.url).pathname;
		if (path === "/start")
			return Response.json(
				await env.ACCOUNT.beginConnection({
					sessionId,
					returnTo: "http://127.0.0.1:5178/complete",
				})
			);
		if (path === "/finish" && request.method === "POST")
			return Response.json(
				await env.ACCOUNT.completeConnection({
					...(await request.json()),
					sessionId,
				})
			);
		if (path === "/disconnect" && request.method === "POST")
			return Response.json(await env.ACCOUNT.disconnectAll());
		using selected = await env.ACCOUNT.getIdentity("vite-agent");
		const status = await selected.getStatus();
		return Response.json({
			status,
			...(status.state === "ready"
				? {
						data: await (
							await selected.fetch("https://api.identity.local/items")
						).json(),
					}
				: {}),
		});
	},
};
