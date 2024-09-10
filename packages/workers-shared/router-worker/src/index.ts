import type { UnstableCanFetchMethod } from "../../asset-worker/src";
import type { RoutingConfig } from "../../utils/utils";

interface Env {
	ASSET_WORKER: Fetcher & {
		unstable_canFetch: UnstableCanFetchMethod;
	};
	USER_WORKER: Fetcher;
	CONFIG: RoutingConfig;
}

export default {
	async fetch(request: Request, env: Env) {
		if (env.CONFIG.hasUserWorker) {
			if (await env.ASSET_WORKER.unstable_canFetch(request)) {
				return await env.ASSET_WORKER.fetch(request);
			} else {
				return env.USER_WORKER.fetch(request);
			}
		}

		return await env.ASSET_WORKER.fetch(request);
	},
};
