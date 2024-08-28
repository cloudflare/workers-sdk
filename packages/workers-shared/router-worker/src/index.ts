import type { Fetcher, Request } from "@cloudflare/workers-types";

interface Env {
	ASSET_WORKER: Fetcher;
	USER_WORKER: Fetcher;
}
export default {
	async fetch(request: Request, env: Env) {
		const result = await env.ASSET_WORKER.fetch(request);
		if (!result.ok) {
			if (result.status === 404) {
				return await env.USER_WORKER.fetch(request);
			}
			// return failed response on non-404 errors
			return new Response(`Failed to fetch content: ${result.statusText}`, {
				status: result.status,
			});
		}
		return result;
	},
};
