export interface Env {
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	ASSETS: Fetcher;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/")) {
			return new Response("API HANDLED BY WORKER", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			});
		}
		return await env.ASSETS.fetch(request);
	},
};
