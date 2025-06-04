export interface Env {
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	ASSETS: Fetcher;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const auth = request.headers.get("Authorization");

		if (!auth) {
			return new Response("Forbidden", {
				status: 403,
				statusText: "Forbidden",
				headers: {
					"Content-Type": "text/plain",
				},
			});
		}

		return await env.ASSETS.fetch(request);
	},
};
