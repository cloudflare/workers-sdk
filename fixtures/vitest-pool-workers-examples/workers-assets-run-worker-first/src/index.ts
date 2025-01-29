export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/binding") {
			return env.ASSETS.fetch(request);
		}
		return new Response("Hello, World!", {
			headers: { "x-test": "hello" },
		});
	},
} satisfies ExportedHandler<Env>;
