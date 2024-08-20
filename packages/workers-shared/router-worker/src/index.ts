import type { Fetcher, Request } from "@cloudflare/workers-types";

interface Env {
	ASSET_SERVER: Fetcher;
	USER_WORKER: Fetcher;
}
export default {
	async fetch(request: Request, env: Env) {
		const result = await env.ASSET_SERVER.fetch(request);
		if (!result.ok) {
			if (result.status === 404) {
				await env.USER_WORKER.fetch(request);
			}
			return new Response(`Failed to fetch content: ${result.statusText}`, {
				status: result.status,
			});
		}
	},
};
