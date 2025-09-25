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

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
