import { env } from "cloudflare:workers";

export default {
	fetch() {
		return new Response(env.MY_TEXT);
	},
} satisfies ExportedHandler;
