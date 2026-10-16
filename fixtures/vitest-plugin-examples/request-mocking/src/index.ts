export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		url.host = "cloudflare.com";

		try {
			// Special handler: open a WebSocket to the rewritten URL, send a
			// message, then return the first reply as the response.
			if (url.pathname === "/echo-ws") {
				url.protocol = "wss:";
				const ws = new WebSocket(url.toString());
				try {
					const messagePromise = new Promise<string>((resolve, reject) => {
						const timeout = setTimeout(
							() => reject(new Error("WebSocket connection timed out")),
							5_000
						);
						ws.addEventListener("message", (event) => {
							clearTimeout(timeout);
							resolve(String(event.data));
						});
						ws.addEventListener("error", () => {
							clearTimeout(timeout);
							reject(new Error("WebSocket connection errored"));
						});
					});
					ws.addEventListener("open", () => ws.send("hello"));
					return Response.json({ message: await messagePromise });
				} finally {
					ws.close();
				}
			}

			return await fetch(url, request);
		} catch (e) {
			return new Response(String(e), { status: 500 });
		}
	},
} satisfies ExportedHandler;
