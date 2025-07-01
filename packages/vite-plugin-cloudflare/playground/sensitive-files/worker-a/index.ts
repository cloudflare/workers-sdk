interface Env {
	WORKER_B: Fetcher;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/worker-b") {
			return env.WORKER_B.fetch(request);
		}

		return new Response("Worker A response");
	},
} satisfies ExportedHandler<Env>;
