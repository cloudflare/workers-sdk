export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/remote") {
			await env.MY_R2.get("key");
		}
		return new Response("Hello");
	},
} satisfies ExportedHandler<{ MY_R2: R2Bucket }>;
