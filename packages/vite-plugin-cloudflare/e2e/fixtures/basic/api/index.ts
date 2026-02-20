import crypto from "node:crypto";

// This just ensures that the import doesn't get tree shaken
console.log(typeof crypto);
interface Env {
	ASSETS: Fetcher;
	AI: Ai;
}

let requestAborted = false;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Cloudflare",
			});
		}

		if (url.pathname === "/env/") {
			return Response.json(env);
		}

		if (url.pathname === "/wait") {
			request.signal.addEventListener("abort", () => {
				requestAborted = true;
			});

			const { readable, writable } = new IdentityTransformStream();
			// Acquire the writer immediately before returning the Response
			// to ensure the stream stays open for writes
			const writer = writable.getWriter();
			const enc = new TextEncoder();

			ctx.waitUntil(
				(async () => {
					try {
						for (let i = 0; i < 6; i++) {
							// Send 'ping' every 500ms to keep the connection alive for 3 seconds
							await writer.write(enc.encode("ping\r\n"));
							await scheduler.wait(500);
						}
					} finally {
						await writer.close();
					}
				})()
			);

			return new Response(readable, {
				headers: { "Content-Type": "text/plain" },
			});
		}

		if (url.pathname === "/aborted") {
			return new Response(
				requestAborted ? "Request aborted" : "Request not aborted"
			);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
