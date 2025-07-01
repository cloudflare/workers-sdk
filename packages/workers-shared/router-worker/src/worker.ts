import { generateStaticRoutingRuleMatcher } from "../../asset-worker/src/utils/rules-engine";
import { PerformanceTimer } from "../../utils/performance";
import { setupSentry } from "../../utils/sentry";
import { mockJaegerBinding } from "../../utils/tracing";
import { Analytics, DISPATCH_TYPE, STATIC_ROUTING_DECISION } from "./analytics";
import {
	applyEyeballConfigDefaults,
	applyRouterConfigDefaults,
} from "./configuration";
import { renderLimitedResponse } from "./limited-response";
import type AssetWorker from "../../asset-worker";
import type {
	EyeballRouterConfig,
	JaegerTracing,
	RouterConfig,
	UnsafePerformanceTimer,
} from "../../utils/types";
import type { ColoMetadata, Environment, ReadyAnalytics } from "./types";

export interface Env {
	ASSET_WORKER: Service<AssetWorker>;
	USER_WORKER: Fetcher;
	CONFIG: RouterConfig;
	EYEBALL_CONFIG: EyeballRouterConfig;

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
				env.VERSION_METADATA,
				env.CONFIG?.account_id,
				env.CONFIG?.script_id
			);

			const hasStaticRouting = env.CONFIG.static_routing !== undefined;
			const config = applyRouterConfigDefaults(env.CONFIG);
			const eyeballConfig = applyEyeballConfigDefaults(env.EYEBALL_CONFIG);

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
					version: env.VERSION_METADATA.tag,
					userWorkerAhead: config.invoke_user_worker_ahead_of_assets,
				});
			}

			const maybeSecondRequest = request.clone();

			const routeToUserWorker = async ({
				asset,
			}: {
				asset: "static_routing" | "none";
			}) => {
				if (!config.has_user_worker) {
					throw new Error(
						"Fetch for user worker without having a user worker binding"
					);
				}
				if (eyeballConfig.limitedAssetsOnly) {
					analytics.setData({ userWorkerFreeTierLimiting: true });
					return new Response(renderLimitedResponse(maybeSecondRequest), {
						status: 429,
						headers: {
							"Content-Type": "text/html",
						},
					});
				}
				analytics.setData({ dispatchtype: DISPATCH_TYPE.WORKER });
				userWorkerInvocation = true;
				return env.JAEGER.enterSpan("dispatch_worker", async (span) => {
					span.setTags({
						hasUserWorker: true,
						asset: asset,
						dispatchType: DISPATCH_TYPE.WORKER,
					});

					let shouldBlockNonImageResponse = false;
					if (url.pathname === "/_next/image") {
						// is a next image
						const queryURLParam = url.searchParams.get("url");
						if (queryURLParam && !queryURLParam.startsWith("/")) {
							// that's a remote resource
							if (
								maybeSecondRequest.method !== "GET" ||
								maybeSecondRequest.headers.get("sec-fetch-dest") !== "image"
							) {
								// that was not loaded via a browser's <img> tag
								shouldBlockNonImageResponse = true;
								analytics.setData({ abuseMitigationURLHost: queryURLParam });
							}
							// otherwise, we're good
						}
					}

					if (shouldBlockNonImageResponse) {
						const resp = await env.USER_WORKER.fetch(maybeSecondRequest);
						if (
							!resp.headers.get("content-type")?.startsWith("image/") &&
							resp.status !== 304
						) {
							analytics.setData({ abuseMitigationBlocked: true });
							return new Response("Blocked", { status: 403 });
						}
						return resp;
					}
					return env.USER_WORKER.fetch(maybeSecondRequest);
				});
			};

			const routeToAssets = async ({
				asset,
			}: {
				asset: "static_routing" | "found" | "none";
			}) => {
				analytics.setData({ dispatchtype: DISPATCH_TYPE.ASSETS });
				return await env.JAEGER.enterSpan("dispatch_assets", async (span) => {
					span.setTags({
						hasUserWorker: config.has_user_worker,
						asset: asset,
						dispatchType: DISPATCH_TYPE.ASSETS,
					});

					return env.ASSET_WORKER.fetch(maybeSecondRequest);
				});
			};

			if (config.static_routing) {
				// evaluate "exclude" rules
				const excludeRulesMatcher = generateStaticRoutingRuleMatcher(
					config.static_routing.asset_worker ?? []
				);
				if (
					excludeRulesMatcher({
						request,
					})
				) {
					// direct to asset worker
					analytics.setData({
						staticRoutingDecision: STATIC_ROUTING_DECISION.ROUTED,
					});
					return await routeToAssets({ asset: "static_routing" });
				}
				// evaluate "include" rules
				const includeRulesMatcher = generateStaticRoutingRuleMatcher(
					config.static_routing.user_worker
				);
				if (
					includeRulesMatcher({
						request,
					})
				) {
					if (!config.has_user_worker) {
						throw new Error(
							"Fetch for user worker without having a user worker binding"
						);
					}
					// direct to user worker
					analytics.setData({
						staticRoutingDecision: STATIC_ROUTING_DECISION.ROUTED,
					});
					return await routeToUserWorker({ asset: "static_routing" });
				}

				analytics.setData({
					staticRoutingDecision: hasStaticRouting
						? STATIC_ROUTING_DECISION.NOT_ROUTED
						: STATIC_ROUTING_DECISION.NOT_PROVIDED,
				});
			}

			// User's configuration indicates they want user-Worker to run ahead of any
			// assets. Do not provide any fallback logic.
			if (config.invoke_user_worker_ahead_of_assets) {
				return await routeToUserWorker({ asset: "static_routing" });
			}

			// If we have a user-Worker, but no assets, dispatch to Worker script
			const assetsExist = await env.ASSET_WORKER.unstable_canFetch(request);
			if (config.has_user_worker && !assetsExist) {
				return await routeToUserWorker({ asset: "none" });
			}

			// Otherwise, we either don't have a user worker, OR we have matching assets and should fetch from the assets binding
			return await routeToAssets({ asset: assetsExist ? "found" : "none" });
		} catch (err) {
			if (userWorkerInvocation) {
				// Don't send user Worker errors to sentry; we have no way to distinguish between
				// CF errors and errors from the user's code.
				throw err;
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
