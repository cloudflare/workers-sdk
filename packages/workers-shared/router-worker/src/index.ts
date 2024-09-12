import { setupSentry } from "../../utils/sentry";
import type AssetWorker from "../../asset-worker/src/index";
import type { RoutingConfig } from "../../utils/types";

interface Env {
	ASSET_WORKER: Service<AssetWorker>;
	USER_WORKER: Fetcher;
	CONFIG: RoutingConfig;

	SENTRY_DSN: string;

	SENTRY_ACCESS_CLIENT_ID: string;
	SENTRY_ACCESS_CLIENT_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		let sentry: ReturnType<typeof setupSentry> | undefined;
		const maybeSecondRequest = request.clone();

		try {
			sentry = setupSentry(
				request,
				ctx,
				env.SENTRY_DSN,
				env.SENTRY_ACCESS_CLIENT_ID,
				env.SENTRY_ACCESS_CLIENT_SECRET
			);

			if (env.CONFIG.has_user_worker) {
				if (await env.ASSET_WORKER.unstable_canFetch(request)) {
					return await env.ASSET_WORKER.fetch(maybeSecondRequest);
				} else {
					return env.USER_WORKER.fetch(maybeSecondRequest);
				}
			}

			return await env.ASSET_WORKER.fetch(request);
		} catch (err) {
			// Log to Sentry if we can
			if (sentry) {
				sentry.captureException(err);
			}
			throw err;
		}
	},
};
