interface Env {
	BROKER: Fetcher;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Only the native getter can reach this service. Materialize its bounded
		// JSON body before crossing the HTTP bridge; it contains only the audience.
		const body = await request.text();
		return env.BROKER.fetch("http://oidc/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		});
	},
} satisfies ExportedHandler<Env>;
