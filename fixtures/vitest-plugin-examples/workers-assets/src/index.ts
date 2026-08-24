export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/message":
				return new Response("Hello, World!");
			case "/random":
				return new Response(crypto.randomUUID());
			case "/binding":
				return env.ASSETS.fetch(request);
			default:
				return new Response(null, { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
