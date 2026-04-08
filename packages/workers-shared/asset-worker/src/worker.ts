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
	SpanContext,
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

export type AssetWorkerEntrypointProps = {
	traceContext?: SpanContext | null;
};

type GetByETagResult = {
	readableStream: ReadableStream;
	contentType: string | undefined;
	cacheStatus: "HIT" | "MISS";
};

type ExistsFn = (pathname: string, request?: Request) => Promise<string | null>;
type GetByETagFn = (
	eTag: string,
	request?: Request
) => Promise<GetByETagResult>;

interface AssetWorkerLoopback {
	fetch(request: Request): Promise<Response>;
	unstable_canFetch(request: Request): Promise<boolean>;
	unstable_getByETag(eTag: string, request?: Request): Promise<GetByETagResult>;
	unstable_getByPathname(
		pathname: string,
		request?: Request
	): Promise<GetByETagResult | null>;
	unstable_exists(pathname: string, request?: Request): Promise<string | null>;
}

const FORWARDED_METHODS = {
	fetch: true,
	unstable_canFetch: true,
	unstable_getByETag: true,
	unstable_getByPathname: true,
	unstable_exists: true,
} satisfies Record<keyof AssetWorkerLoopback, true>;

type ForwardRequest =
	| { method: "fetch"; request: Request }
	| { method: "unstable_canFetch"; request: Request }
	| { method: "unstable_getByETag"; eTag: string; request?: Request }
	| {
			method: "unstable_getByPathname";
			pathname: string;
			request?: Request;
	  }
	| { method: "unstable_exists"; pathname: string; request?: Request };

type LoopbackExecutionContext = ExecutionContext & {
	exports?: {
		AssetWorkerEntrypoint?: (options: {
			props: AssetWorkerEntrypointProps;
		}) => AssetWorkerLoopback;
	};
};

type PropsExecutionContext = ExecutionContext & {
	props?: AssetWorkerEntrypointProps;
};

async function unstableExistsImpl(
	env: Env,
	pathname: string,
	_request?: Request
): Promise<string | null> {
	const analytics = new ExperimentAnalytics(env.EXPERIMENT_ANALYTICS);
	const performance = new PerformanceTimer(env.UNSAFE_PERFORMANCE);
	const jaeger = env.JAEGER ?? mockJaegerBinding();
	return jaeger.enterSpan("unstable_exists", async (span) => {
		if (env.COLO_METADATA && env.VERSION_METADATA && env.CONFIG) {
			analytics.setData({
				accountId: env.CONFIG.account_id,
				experimentName: "manifest-read-timing",
			});
		}

		const startTimeMs = performance.now();
		try {
			const assetsManifest = new AssetsManifest(env.ASSETS_MANIFEST);
			const eTag = await assetsManifest.get(pathname);

			span.setTags({
				path: pathname,
				found: eTag !== null,
				etag: eTag ?? "",
			});

			return eTag;
		} finally {
			analytics.setData({
				manifestReadTime: performance.now() - startTimeMs,
			});
			analytics.write();
		}
	});
}

async function unstableGetByETagImpl(
	env: Env,
	eTag: string,
	_request?: Request
): Promise<GetByETagResult> {
	const performance = new PerformanceTimer(env.UNSAFE_PERFORMANCE);
	const jaeger = env.JAEGER ?? mockJaegerBinding();
	return jaeger.enterSpan("unstable_getByETag", async (span) => {
		const startTime = performance.now();
		const asset = await getAssetWithMetadataFromKV(env.ASSETS_KV_NAMESPACE, eTag);
		const endTime = performance.now();
		const assetFetchTime = endTime - startTime;

		if (!asset || !asset.value) {
			span.setTags({
				error: true,
			});
			span.addLogs({
				error: `Requested asset ${eTag} exists in the asset manifest but not in the KV namespace.`,
			});
			throw new Error(
				`Requested asset ${eTag} exists in the asset manifest but not in the KV namespace.`
			);
		}

		// KV does not yet provide a way to check if a value was fetched from cache
		// so we assume that if the fetch time is less than 100ms, it was a cache hit.
		// This is a reasonable assumption given the data we have and how KV works.
		const cacheStatus = assetFetchTime <= 100 ? "HIT" : "MISS";

		span.setTags({
			etag: eTag,
			contentType: asset.metadata?.contentType ?? "unknown",
			cacheStatus,
		});

		return {
			readableStream: asset.value,
			contentType: asset.metadata?.contentType,
			cacheStatus,
		};
	});
}

async function runFetchRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	exists: ExistsFn,
	getByETag: GetByETagFn
): Promise<Response> {
	let sentry: ReturnType<typeof setupSentry> | undefined;
	const analytics = new Analytics(env.ANALYTICS);
	const performance = new PerformanceTimer(env.UNSAFE_PERFORMANCE);
	const startTimeMs = performance.now();

	try {
		// TODO: Mock this with Miniflare
		env.JAEGER ??= mockJaegerBinding();

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

		const config = normalizeConfiguration(env.CONFIG);
		sentry?.setContext("compatibilityOptions", {
			compatibilityDate: config.compatibility_date,
			compatibilityFlags: config.compatibility_flags,
			originalCompatibilityFlags: env.CONFIG.compatibility_flags,
		});
		const userAgent = request.headers.get("user-agent") ?? "UA UNKNOWN";

		const url = new URL(request.url);
		if (env.COLO_METADATA && env.VERSION_METADATA && env.CONFIG) {
			analytics.setData({
				accountId: env.CONFIG.account_id,
				scriptId: env.CONFIG.script_id,

				coloId: env.COLO_METADATA.coloId,
				metalId: env.COLO_METADATA.metalId,
				coloTier: env.COLO_METADATA.coloTier,

				coloRegion: env.COLO_METADATA.coloRegion,
				version: env.VERSION_METADATA.tag,
				hostname: url.hostname,
				htmlHandling: config.html_handling,
				notFoundHandling: config.not_found_handling,
				compatibilityFlags: config.compatibility_flags,
				userAgent: userAgent,
			});
		}

		return await env.JAEGER.enterSpan("handleRequest", async (span) => {
			span.setTags({
				hostname: url.hostname,
				eyeballPath: url.pathname,
				env: env.ENVIRONMENT,
				version: env.VERSION_METADATA?.id,
			});

			const response = await handleRequest(
				request,
				env,
				config,
				exists,
				getByETag,
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

/*
 * The Asset Worker is currently set up as a `WorkerEntrypoint` class so
 * that it is able to accept RPC calls to any of its public methods. There
 * are currently four such public methods defined on this Worker:
 * `canFetch`, `getByETag`, `getByPathname` and `exists`. While we are
 * stabilizing the implementation details of these methods, we would like
 * to prevent developers from having their Workers call these methods
 * directly. To that end, we are adopting the `unstable_<method_name>`
 * naming convention for all of the aforementioned methods, to indicate that
 * they are still in flux and that they are not an established API contract.
 */
export default class AssetWorker<TEnv extends Env = Env>
	extends WorkerEntrypoint<TEnv>
	implements AssetWorkerLoopback
{
	/**
	 * True when a subclass (e.g. Vite's CustomAssetWorker) extends AssetWorker
	 * for local development. Subclasses override unstable_exists / unstable_getByETag
	 * with dev-server-backed implementations, so loopback must be skipped to
	 * preserve polymorphic dispatch.
	 */
	private isSubclassedForLocalDev(): boolean {
		return this.constructor !== AssetWorker;
	}

	private getLoopbackEntrypoint(): (options: {
		props: AssetWorkerEntrypointProps;
	}) => AssetWorkerLoopback {
		const loopbackCtx = this.ctx as LoopbackExecutionContext;
		const entrypoint = loopbackCtx.exports?.AssetWorkerEntrypoint;
		if (entrypoint === undefined) {
			throw new Error(
				"AssetWorkerEntrypoint not found on ctx.exports. " +
					"Ensure enable_ctx_exports compatibility flag is set and " +
					"AssetWorkerEntrypoint is exported from the worker module."
			);
		}
		return entrypoint;
	}

	private forwardToInner(request: {
		method: "fetch";
		request: Request;
	}): Promise<Response | null>;
	private forwardToInner(request: {
		method: "unstable_canFetch";
		request: Request;
	}): Promise<boolean | null>;
	private forwardToInner(request: {
		method: "unstable_getByETag";
		eTag: string;
		request?: Request;
	}): Promise<GetByETagResult | null>;
	private forwardToInner(request: {
		method: "unstable_getByPathname";
		pathname: string;
		request?: Request;
	}): Promise<GetByETagResult | null>;
	private forwardToInner(request: {
		method: "unstable_exists";
		pathname: string;
		request?: Request;
	}): Promise<string | null>;
	private async forwardToInner(
		request: ForwardRequest
	): Promise<Response | boolean | GetByETagResult | string | null> {
		if (!FORWARDED_METHODS[request.method]) {
			return null;
		}

		const binding = this.getLoopbackEntrypoint()({
			props: {
				traceContext: this.env.JAEGER.getSpanContext(),
			},
		});

		switch (request.method) {
			case "fetch":
				return binding.fetch(request.request);
			case "unstable_canFetch":
				return binding.unstable_canFetch(request.request);
			case "unstable_getByETag":
				return binding.unstable_getByETag(request.eTag, request.request);
			case "unstable_getByPathname":
				return binding.unstable_getByPathname(
					request.pathname,
					request.request
				);
			case "unstable_exists":
				return binding.unstable_exists(request.pathname, request.request);
		}
	}

	override async fetch(request: Request): Promise<Response> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		if (this.isSubclassedForLocalDev()) {
			return runFetchRequest(
				request,
				this.env,
				this.ctx,
				this.unstable_exists.bind(this),
				this.unstable_getByETag.bind(this)
			);
		}

		const response = await this.forwardToInner({
			method: "fetch",
			request,
		});
		if (response !== null) {
			return response;
		}

		throw new Error("Loopback fetch returned null unexpectedly.");
	}

	async unstable_canFetch(request: Request): Promise<boolean> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		if (this.isSubclassedForLocalDev()) {
			return canFetch(
				request,
				this.env,
				normalizeConfiguration(this.env.CONFIG),
				this.unstable_exists.bind(this)
			);
		}

		const response = await this.forwardToInner({
			method: "unstable_canFetch",
			request,
		});
		if (response !== null) {
			return response;
		}

		throw new Error("Loopback unstable_canFetch returned null unexpectedly.");
	}

	async unstable_getByETag(
		eTag: string,
		request?: Request
	): Promise<GetByETagResult> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		if (this.isSubclassedForLocalDev()) {
			return unstableGetByETagImpl(this.env, eTag, request);
		}

		const response = await this.forwardToInner({
			method: "unstable_getByETag",
			eTag,
			request,
		});
		if (response !== null) {
			return response;
		}

		throw new Error("Loopback unstable_getByETag returned null unexpectedly.");
	}

	async unstable_getByPathname(
		pathname: string,
		request?: Request
	): Promise<GetByETagResult | null> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		if (this.isSubclassedForLocalDev()) {
			return this.env.JAEGER.enterSpan(
				"unstable_getByPathname",
				async (span) => {
					const eTag = await this.unstable_exists(pathname, request);

					span.setTags({
						path: pathname,
						found: eTag !== null,
					});

					if (!eTag) {
						return null;
					}

					return this.unstable_getByETag(eTag, request);
				}
			);
		}

		const response = await this.forwardToInner({
			method: "unstable_getByPathname",
			pathname,
			request,
		});
		if (response !== null) {
			return response;
		}

		throw new Error(
			"Loopback unstable_getByPathname returned null unexpectedly."
		);
	}

	async unstable_exists(
		pathname: string,
		request?: Request
	): Promise<string | null> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();

		if (this.isSubclassedForLocalDev()) {
			return unstableExistsImpl(this.env, pathname, request);
		}

		const response = await this.forwardToInner({
			method: "unstable_exists",
			pathname,
			request,
		});
		if (response !== null) {
			return response;
		}

		throw new Error("Loopback unstable_exists returned null unexpectedly.");
	}
}

export class AssetWorkerEntrypoint extends WorkerEntrypoint<Env> {
	override async fetch(request: Request): Promise<Response> {
		// TODO: Mock this with Miniflare
		this.env.JAEGER ??= mockJaegerBinding();
		const loopbackCtx = this.ctx as PropsExecutionContext;
		const traceContext = loopbackCtx.props?.traceContext ?? null;

		const response = await this.env.JAEGER.runWithSpanContext(
			traceContext,
			() =>
				runFetchRequest(
					request,
					this.env,
					this.ctx,
					this.unstable_exists.bind(this),
					this.unstable_getByETag.bind(this)
				)
		);

		if (response instanceof Response) {
			return response;
		}

		throw new Error("AssetWorkerEntrypoint fetch returned non-Response value.");
	}

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

	async unstable_getByETag(
		eTag: string,
		request?: Request
	): Promise<GetByETagResult> {
		return unstableGetByETagImpl(this.env, eTag, request);
	}

	async unstable_getByPathname(
		pathname: string,
		request?: Request
	): Promise<GetByETagResult | null> {
		const jaeger = this.env.JAEGER ?? mockJaegerBinding();
		return jaeger.enterSpan("unstable_getByPathname", async (span) => {
			const eTag = await this.unstable_exists(pathname, request);

			span.setTags({
				path: pathname,
				found: eTag !== null,
			});

			if (!eTag) {
				return null;
			}

			return this.unstable_getByETag(eTag, request);
		});
	}

	async unstable_exists(
		pathname: string,
		request?: Request
	): Promise<string | null> {
		return unstableExistsImpl(this.env, pathname, request);
	}
}
