import { env } from "cloudflare:workers";

export default {
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/text-binding") {
			return new Response(env.MY_TEXT);
		}
		return new Response("hello from worker");
	},
} satisfies ExportedHandler;
