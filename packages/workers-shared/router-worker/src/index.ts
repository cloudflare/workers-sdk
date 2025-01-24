import { PerformanceTimer } from "../../utils/performance";
import { InternalServerErrorResponse } from "../../utils/responses";
import { setupSentry } from "../../utils/sentry";
import { mockJaegerBinding } from "../../utils/tracing";
import { Analytics, DISPATCH_TYPE } from "./analytics";
import type AssetWorker from "../../asset-worker/src/index";
import type {
	JaegerTracing,
	RoutingConfig,
	UnsafePerformanceTimer,
} from "../../utils/types";
import type { ColoMetadata, Environment, ReadyAnalytics } from "./types";
import type { Toucan } from "toucan-js";

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
	JAEGER: JaegerTracing;

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
			if (!env.JAEGER) {
				env.JAEGER = mockJaegerBinding();
			}

			sentry = setupSentry(
				request,
				ctx,
				env.SENTRY_DSN,
				env.SENTRY_ACCESS_CLIENT_ID,
				env.SENTRY_ACCESS_CLIENT_SECRET,
				env.COLO_METADATA,
				env.CONFIG?.account_id,
				env.CONFIG?.script_id
			);

			const url = new URL(request.url);

			if (env.COLO_METADATA && env.VERSION_METADATA && env.CONFIG) {
				analytics.setData({
					accountId: env.CONFIG.account_id,
					scriptId: env.CONFIG.script_id,

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
				return await env.JAEGER.enterSpan(
					"invoke_user_worker_first",
					async () => {
						if (!env.CONFIG.has_user_worker) {
							throw new Error(
								"Fetch for user worker without having a user worker binding"
							);
						}
						return env.USER_WORKER.fetch(maybeSecondRequest);
					}
				);
			}

			// Otherwise, we try to first fetch assets, falling back to user-Worker.
			if (env.CONFIG.has_user_worker) {
				return await env.JAEGER.enterSpan("has_user_worker", async (span) => {
					if (await env.ASSET_WORKER.unstable_canFetch(request)) {
						span.setTags({
							asset: true,
							dispatchType: DISPATCH_TYPE.ASSETS,
						});

						analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
						return env.ASSET_WORKER.fetch(maybeSecondRequest);
					} else {
						span.setTags({
							asset: false,
							dispatchType: DISPATCH_TYPE.WORKER,
						});

						analytics.setData({ dispatchtype: DISPATCH_TYPE.WORKER });
						return env.USER_WORKER.fetch(maybeSecondRequest);
					}
				});
			}

			return await env.JAEGER.enterSpan("assets_only", async (span) => {
				span.setTags({
					asset: true,
					dispatchType: DISPATCH_TYPE.ASSETS,
				});

				analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
				return env.ASSET_WORKER.fetch(request);
			});
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
