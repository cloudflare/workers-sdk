import { PerformanceTimer } from "../../utils/performance";
import { setupSentry } from "../../utils/sentry";
import { Analytics, DISPATCH_TYPE } from "./analytics";
import type AssetWorker from "../../asset-worker/src/index";
import type { RoutingConfig, UnsafePerformanceTimer } from "../../utils/types";
import type { ColoMetadata, Environment, ReadyAnalytics } from "./types";

interface Env {
	ASSET_WORKER: Service<AssetWorker>;
	USER_WORKER: Fetcher;
	CONFIG: RoutingConfig;

	SENTRY_DSN: string;
	ENVIRONMENT: Environment;
	ANALYTICS: ReadyAnalytics;
	COLO_METADATA: ColoMetadata;
	UNSAFE_PERFORMANCE: UnsafePerformanceTimer;
	VERSION_METADATA: WorkerVersionMetadata;

	SENTRY_ACCESS_CLIENT_ID: string;
	SENTRY_ACCESS_CLIENT_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		let sentry: ReturnType<typeof setupSentry> | undefined;
		const analytics = new Analytics(env.ANALYTICS);
		const performance = new PerformanceTimer(env.UNSAFE_PERFORMANCE);
		const startTimeMs = performance.now();

		try {
			sentry = setupSentry(
				request,
				ctx,
				env.SENTRY_DSN,
				env.SENTRY_ACCESS_CLIENT_ID,
				env.SENTRY_ACCESS_CLIENT_SECRET
			);

			const url = new URL(request.url);
			if (sentry) {
				sentry.setUser({ username: url.hostname });
				sentry.setTag("colo", env.COLO_METADATA.coloId);
				sentry.setTag("metal", env.COLO_METADATA.metalId);
			}

			if (env.COLO_METADATA && env.VERSION_METADATA && env.CONFIG) {
				analytics.setData({
					coloId: env.COLO_METADATA.coloId,
					metalId: env.COLO_METADATA.metalId,
					coloTier: env.COLO_METADATA.coloTier,
					coloRegion: env.COLO_METADATA.coloRegion,
					hostname: url.hostname,
					version: env.VERSION_METADATA.id,
					userWorkerAhead: env.CONFIG.invoke_user_worker_ahead_of_assets,
				});
			}

			const maybeSecondRequest = request.clone();

			// User's configuration indicates they want user-Worker to run ahead of any
			// assets. Do not provide any fallback logic.
			if (env.CONFIG.invoke_user_worker_ahead_of_assets) {
				if (!env.CONFIG.has_user_worker) {
					throw new Error(
						"Fetch for user worker without having a user worker binding"
					);
				}
				return env.USER_WORKER.fetch(maybeSecondRequest);
			}

			// Otherwise, we try to first fetch assets, falling back to user-Worker.
			if (env.CONFIG.has_user_worker) {
				if (await env.ASSET_WORKER.unstable_canFetch(request)) {
					analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
					return env.ASSET_WORKER.fetch(maybeSecondRequest);
				} else {
					analytics.setData({ dispatchtype: DISPATCH_TYPE.WORKER });
					return env.USER_WORKER.fetch(maybeSecondRequest);
				}
			}

			analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
			return env.ASSET_WORKER.fetch(request);
		} catch (err) {
			if (err instanceof Error) {
				analytics.setData({ error: err.message });
			}

			// Log to Sentry if we can
			if (sentry) {
				sentry.captureException(err);
			}
			throw err;
		} finally {
			analytics.setData({ requestTime: performance.now() - startTimeMs });
			analytics.write();
		}
	},
};
