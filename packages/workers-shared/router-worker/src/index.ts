import type { RoutingConfig } from "../../utils/types";

interface Env {
	ASSET_WORKER: Fetcher;
	USER_WORKER: Fetcher;
	CONFIG: RoutingConfig;
}

export default {
	async fetch(request: Request, env: Env) {
		const maybeUserRequest = request.clone();
		const result = await env.ASSET_WORKER.fetch(request);
		// 404 = asset not in manifest
		if (result.status === 404 && env.CONFIG.hasUserWorker) {
			return await env.USER_WORKER.fetch(maybeUserRequest);
		}
		// all other responses from AW are simply returned
		return result;
	},
};
