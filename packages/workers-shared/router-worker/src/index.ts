import type AssetWorker from "../../asset-worker/src/index";
import type { RoutingConfig } from "../../utils/types";

interface Env {
	ASSET_WORKER: Service<AssetWorker>;
	USER_WORKER: Fetcher;
	CONFIG: RoutingConfig;
}

export default {
	async fetch(request: Request, env: Env) {
		const maybeSecondRequest = request.clone();
		if (env.CONFIG.has_user_worker) {
			if (await env.ASSET_WORKER.unstable_canFetch(request)) {
				return await env.ASSET_WORKER.fetch(maybeSecondRequest);
			} else {
				return env.USER_WORKER.fetch(maybeSecondRequest);
			}
		}

		return await env.ASSET_WORKER.fetch(request);
	},
};
