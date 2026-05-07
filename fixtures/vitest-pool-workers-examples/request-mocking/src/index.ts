export default <ExportedHandler>{
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		url.host = "cloudflare.com";

		// Special handler: open a WebSocket to the rewritten URL, send the
		// request body as a message, then return the first reply as the response.
		if (url.pathname === "/echo-ws") {
			url.protocol = "wss:";
			const ws = new WebSocket(url.toString());
			const messagePromise = new Promise<string>((resolve, reject) => {
				ws.addEventListener("message", (event) =>
					resolve(event.data as string)
				);
				ws.addEventListener("error", () =>
					reject(new Error("WebSocket connection errored"))
				);
			});
			ws.addEventListener("open", () => ws.send("hello"));
			return Response.json({ message: await messagePromise });
		}

		try {
			return await fetch(url, request);
		} catch (e) {
			return new Response(String(e), { status: 500 });
		}
	},
};
