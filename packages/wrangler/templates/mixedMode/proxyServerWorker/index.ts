export default {
	async fetch(request, env) {
		const targetBinding = request.headers.get("MF-Binding-Name");
		if (targetBinding) {
			return env[targetBinding].fetch(
				request.headers.get("MF-URL")!,
				new Request(request, {
					redirect: "manual",
				})
			);
		}
		return new Response("no-op mixed-mode proxyServerWorker");
	},
} satisfies ExportedHandler<Record<string, Fetcher>>;
