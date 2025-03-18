import { WorkerEntrypoint } from "cloudflare:workers";
import { PerformanceTimer } from "../../utils/performance";
import { setupSentry } from "../../utils/sentry";
import { mockJaegerBinding } from "../../utils/tracing";
import { Analytics } from "./analytics";
import { AssetsManifest } from "./assets-manifest";
import { normalizeConfiguration } from "./configuration";
import { ExperimentAnalytics } from "./experiment-analytics";
import { canFetch, handleRequest } from "./handler";
import { handleError, submitMetrics } from "./utils/final-operations";
import { getAssetWithMetadataFromKV } from "./utils/kv";
import type {
	AssetConfig,
	ColoMetadata,
	JaegerTracing,
	UnsafePerformanceTimer,
} from "../../utils/types";
import type { Environment, ReadyAnalytics } from "./types";

export type Env = {
	/*
	 * ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
	 * binary-encoded site manifest
	 */
	ASSETS_MANIFEST: ArrayBuffer;

	/*
	 * ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
	 * assets are in.
	 */
	ASSETS_KV_NAMESPACE: KVNamespace;

	CONFIG: AssetConfig;

	SENTRY_DSN: string;
	SENTRY_ACCESS_CLIENT_ID: string;
	SENTRY_ACCESS_CLIENT_SECRET: string;

	JAEGER: JaegerTracing;

	ENVIRONMENT: Environment;
	EXPERIMENT_ANALYTICS: ReadyAnalytics;
	ANALYTICS: ReadyAnalytics;
	COLO_METADATA: ColoMetadata;
	UNSAFE_PERFORMANCE: UnsafePerformanceTimer;
	VERSION_METADATA: WorkerVersionMetadata;
};

/*
 * The Asset Worker is currently set up as a `WorkerEntrypoint` class so
 * that it is able to accept RPC calls to any of its public methods. There
 * are currently four such public methods defined on this Worker:
 * `canFetch`, `getByETag`, `getByPathname` and `exists`. While we are
 * stabilising the implementation details of these methods, we would like
 * to prevent developers from having their Workers call these methods
 * directly. To that end, we are adopting the `unstable_<method_name>`
 * naming convention for all of the aforementioned methods, to indicate that
 * they are still in flux and that they are not an established API contract.
 */
export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		let sentry: ReturnType<typeof setupSentry> | undefined;
		const analytics = new Analytics(this.env.ANALYTICS);
		const performance = new PerformanceTimer(this.env.UNSAFE_PERFORMANCE);
		const startTimeMs = performance.now();

		try {
			// TODO: Mock this with Miniflare
			this.env.JAEGER ??= mockJaegerBinding();

			sentry = setupSentry(
				request,
				this.ctx,
				this.env.SENTRY_DSN,
				this.env.SENTRY_ACCESS_CLIENT_ID,
				this.env.SENTRY_ACCESS_CLIENT_SECRET,
				this.env.COLO_METADATA,
				this.env.VERSION_METADATA,
				this.env.CONFIG?.account_id,
				this.env.CONFIG?.script_id
			);

			const config = normalizeConfiguration(this.env.CONFIG);
			sentry?.setContext("compatibilityOptions", {
				compatibilityDate: config.compatibility_date,
				compatibilityFlags: config.compatibility_flags,
				originalCompatibilityFlags: this.env.CONFIG.compatibility_flags,
			});
			const userAgent = request.headers.get("user-agent") ?? "UA UNKNOWN";

			const url = new URL(request.url);
			if (
				this.env.COLO_METADATA &&
				this.env.VERSION_METADATA &&
				this.env.CONFIG
			) {
				analytics.setData({
					accountId: this.env.CONFIG.account_id,
					scriptId: this.env.CONFIG.script_id,

					coloId: this.env.COLO_METADATA.coloId,
					metalId: this.env.COLO_METADATA.metalId,
					coloTier: this.env.COLO_METADATA.coloTier,

					coloRegion: this.env.COLO_METADATA.coloRegion,
					version: this.env.VERSION_METADATA.tag,
					hostname: url.hostname,
					htmlHandling: config.html_handling,
					notFoundHandling: config.not_found_handling,
					compatibilityFlags: config.compatibility_flags,
					userAgent: userAgent,
				});
			}

			return await this.env.JAEGER.enterSpan("handleRequest", async (span) => {
				span.setTags({
					hostname: url.hostname,
					eyeballPath: url.pathname,
					env: this.env.ENVIRONMENT,
					version: this.env.VERSION_METADATA?.id,
				});

				const response = await handleRequest(
					request,
					this.env,
					config,
					this.unstable_exists.bind(this),
					this.unstable_getByETag.bind(this),
					analytics
				);

				analytics.setData({ status: response.status });

				return response;
			});
		} catch (err) {
			return handleError(sentry, analytics, err);
		} finally {
			submitMetrics(analytics, performance, startTimeMs);
		}
	}

	// TODO: Add observability to these methods
	async unstable_canFetch(request: Request): Promise<boolean> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		return canFetch(
			request,
			this.env,
			normalizeConfiguration(this.env.CONFIG),
			this.unstable_exists.bind(this)
		);
	}

	async unstable_getByETag(eTag: string): Promise<{
		readableStream: ReadableStream;
		contentType: string | undefined;
		cacheStatus: "HIT" | "MISS";
	}> {
		const performance = new PerformanceTimer(this.env.UNSAFE_PERFORMANCE);
		const startTime = performance.now();
		const asset = await getAssetWithMetadataFromKV(
			this.env.ASSETS_KV_NAMESPACE,
			eTag
		);
		const endTime = performance.now();
		const assetFetchTime = endTime - startTime;

		if (!asset || !asset.value) {
			throw new Error(
				`Requested asset ${eTag} exists in the asset manifest but not in the KV namespace.`
			);
		}

		return {
			readableStream: asset.value,
			contentType: asset.metadata?.contentType,
			// KV does not yet provide a way to check if a value was fetched from cache
			// so we assume that if the fetch time is less than 100ms, it was a cache hit.
			// This is a reasonable assumption given the data we have and how KV works.
			cacheStatus: assetFetchTime <= 100 ? "HIT" : "MISS",
		};
	}

	async unstable_getByPathname(pathname: string): Promise<{
		readableStream: ReadableStream;
		contentType: string | undefined;
		cacheStatus: "HIT" | "MISS";
	} | null> {
		const eTag = await this.unstable_exists(pathname);
		if (!eTag) {
			return null;
		}

		return this.unstable_getByETag(eTag);
	}

	async unstable_exists(pathname: string): Promise<string | null> {
		const analytics = new ExperimentAnalytics(this.env.EXPERIMENT_ANALYTICS);
		const performance = new PerformanceTimer(this.env.UNSAFE_PERFORMANCE);

		if (
			this.env.COLO_METADATA &&
			this.env.VERSION_METADATA &&
			this.env.CONFIG
		) {
			analytics.setData({
				accountId: this.env.CONFIG.account_id,
				experimentName: "manifest-read-timing",
			});
		}

		const startTimeMs = performance.now();
		try {
			const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);
			return await assetsManifest.get(pathname);
		} finally {
			analytics.setData({ manifestReadTime: performance.now() - startTimeMs });
			analytics.write();
		}
	}
}
