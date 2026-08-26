export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/kv") {
			await env.MY_KV.put("key", "value");
			return new Response(await env.MY_KV.get("key"));
		}

		return new Response(env.MY_TEXT);
	},
} satisfies ExportedHandler<Env>;
