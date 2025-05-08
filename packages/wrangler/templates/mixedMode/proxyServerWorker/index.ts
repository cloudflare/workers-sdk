export default {
	async fetch(request, env) {
		const targetBinding = request.headers.get("MF-Binding");

		if (targetBinding) {
			const originalHeaders = new Headers();
			for (const [name, value] of request.headers) {
				if (name.startsWith("mf-header-")) {
					originalHeaders.set(name.slice("mf-header-".length), value);
				}
			}
			return env[targetBinding].fetch(
				request.headers.get("MF-URL")!,
				new Request(request, {
					redirect: "manual",
					headers: originalHeaders,
				})
			);
		}
		return new Response("Provide a binding", { status: 400 });
	},
} satisfies ExportedHandler<Record<string, Fetcher>>;
