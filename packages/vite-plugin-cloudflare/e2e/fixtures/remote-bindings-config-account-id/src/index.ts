export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/remote") {
			return env.REMOTE_WORKER.fetch(request);
		}
		return new Response("Hello world");
	},
} satisfies ExportedHandler<{ REMOTE_WORKER: Fetcher }>;
