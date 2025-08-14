import crypto from "node:crypto";

// This just ensures that the import doesn't get tree shaken
console.log(typeof crypto);
interface Env {
	ASSETS: Fetcher;
	AI: Ai;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

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
