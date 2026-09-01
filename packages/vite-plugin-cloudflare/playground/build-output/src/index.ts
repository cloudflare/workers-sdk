import { env } from "cloudflare:workers";
import additionalModule from "./additional-module.txt";

export default {
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/text-binding") {
			return new Response(env.MY_TEXT);
		}
		if (url.pathname === "/additional-module") {
			return new Response(additionalModule);
		}
		return new Response("hello from worker");
	},
} satisfies ExportedHandler;
