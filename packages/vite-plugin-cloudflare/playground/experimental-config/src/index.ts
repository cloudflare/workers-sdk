import { env } from "cloudflare:workers";

export default {
	async fetch(request) {
		if (new URL(request.url).pathname === "/auxiliary") {
			return env.AUXILIARY.fetch(request);
		}
		return new Response(env.MY_TEXT);
	},
} satisfies ExportedHandler;
