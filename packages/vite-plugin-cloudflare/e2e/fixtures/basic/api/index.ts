import crypto from "node:crypto";

// This just ensures that the import doesn't get tree shaken
console.log(typeof crypto);
interface Env {
	ASSETS: Fetcher;
	AI: Ai;
}

let lastRequestAborted = false;

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/wait") {
			if (lastRequestAborted) {
				lastRequestAborted = false;
				return new Response(
					"Last request aborted. Make a new request if you wanna wait again."
				);
			}

			request.signal.addEventListener("abort", () => {
				console.log("The request was aborted!");
				lastRequestAborted = true;
			});

			async function sendPing(writable: WritableStream) {
				const writer = writable.getWriter();
				const enc = new TextEncoder();

				for (let i = 0; i < 5; i++) {
					// Send 'ping' every second to keep the connection alive
					await writer.write(enc.encode("ping\r\n"));
					await scheduler.wait(1000);
				}
			}

			const { readable, writable } = new IdentityTransformStream();
			sendPing(writable);
			return new Response(readable, {
				headers: { "Content-Type": "text/plain" },
			});
		}

		if (url.pathname.startsWith("/api/")) {
			return Response.json({
				name: "Cloudflare",
			});
		}

		if (url.pathname === "/env/") {
			return Response.json(env);
		}

		if (url.pathname.startsWith("/ai/")) {
			const messages = [
				{
					role: "user",
					// This prompt generates the same output relatively reliably
					content:
						"Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
				},
			];

			const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
				messages,
			});
			if ("response" in content) {
				return Response.json({
					response: content.response,
				});
			} else {
				return new Response("", { status: 500 });
			}
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
