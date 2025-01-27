import { PerformanceTimer } from "../../utils/performance";
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
		let userWorkerInvocation = false;
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
				if (!env.CONFIG.has_user_worker) {
					throw new Error(
						"Fetch for user worker without having a user worker binding"
					);
				}

				analytics.setData({ dispatchtype: DISPATCH_TYPE.WORKER });
				return await env.JAEGER.enterSpan("dispatch_worker", async (span) => {
					span.setTags({
						hasUserWorker: true,
						asset: "ignored",
						dispatchType: DISPATCH_TYPE.WORKER,
					});

					userWorkerInvocation = true;
					return env.USER_WORKER.fetch(maybeSecondRequest);
				});
			}

			// If we have a user-Worker, but no assets, dispatch to Worker script
			const assetsExist = await env.ASSET_WORKER.unstable_canFetch(request);
			if (env.CONFIG.has_user_worker && !assetsExist) {
				analytics.setData({ dispatchtype: DISPATCH_TYPE.WORKER });

				return await env.JAEGER.enterSpan("dispatch_worker", async (span) => {
					span.setTags({
						hasUserWorker: env.CONFIG.has_user_worker || false,
						asset: assetsExist,
						dispatchType: DISPATCH_TYPE.WORKER,
					});

					userWorkerInvocation = true;
					return env.USER_WORKER.fetch(maybeSecondRequest);
				});
			}

			// Otherwise, we either don't have a user worker, OR we have matching assets and should fetch from the assets binding
			analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
			return await env.JAEGER.enterSpan("dispatch_assets", async (span) => {
				span.setTags({
					hasUserWorker: env.CONFIG.has_user_worker || false,
					asset: assetsExist,
					dispatchType: DISPATCH_TYPE.ASSETS,
				});

				return env.ASSET_WORKER.fetch(maybeSecondRequest);
			});
		} catch (err) {
			if (userWorkerInvocation) {
				// Don't send user Worker errors to sentry; we have no way to distinguish between
				// CF errors and errors from the user's code.
				return;
			} else if (err instanceof Error) {
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
