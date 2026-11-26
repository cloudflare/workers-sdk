export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/remote") {
			const object = await env.MY_R2.get("test-key");
			return new Response(object?.body);
		}
		return new Response("Hello");
	},
} satisfies ExportedHandler<{ MY_R2: R2Bucket }>;
