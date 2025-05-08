export default {
	async fetch(request, env) {
		try {
			const url = new URL(request.url);

			if (url.pathname === "/ping") {
				const result = await env.HEALTH.ping();
				return new Response(result);
			}

			return env.REMOTE.fetch(request);
		} catch (error) {
			return new Response(`${error}`, { status: 500 });
		}
	},
} satisfies ExportedHandler<{ REMOTE: any; HEALTH: any }>;
