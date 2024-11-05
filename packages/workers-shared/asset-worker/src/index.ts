import { WorkerEntrypoint } from "cloudflare:workers";
import { PerformanceTimer } from "../../utils/performance";
import { setupSentry } from "../../utils/sentry";
import { Analytics } from "./analytics";
import { AssetsManifest } from "./assets-manifest";
import { applyConfigurationDefaults } from "./configuration";
import { decodePath, getIntent, handleRequest } from "./handler";
import { InternalServerErrorResponse } from "./responses";
import { getAssetWithMetadataFromKV } from "./utils/kv";
import type { AssetConfig, UnsafePerformanceTimer } from "../../utils/types";
import type { ColoMetadata, Environment, ReadyAnalytics } from "./types";

type Env = {
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

	ENVIRONMENT: Environment;
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
			sentry = setupSentry(
				request,
				this.ctx,
				this.env.SENTRY_DSN,
				this.env.SENTRY_ACCESS_CLIENT_ID,
				this.env.SENTRY_ACCESS_CLIENT_SECRET
			);

			const config = applyConfigurationDefaults(this.env.CONFIG);
			const userAgent = request.headers.get("user-agent") ?? "UA UNKNOWN";

			if (sentry) {
				const colo = this.env.COLO_METADATA.coloId;
				sentry.setTag("colo", this.env.COLO_METADATA.coloId);
				sentry.setTag("metal", this.env.COLO_METADATA.metalId);
				sentry.setUser({ userAgent: userAgent, colo: colo });
			}

			if (this.env.COLO_METADATA && this.env.VERSION_METADATA) {
				const url = new URL(request.url);
				analytics.setData({
					coloId: this.env.COLO_METADATA.coloId,
					metalId: this.env.COLO_METADATA.metalId,
					coloTier: this.env.COLO_METADATA.coloTier,
					coloRegion: this.env.COLO_METADATA.coloRegion,
					version: this.env.VERSION_METADATA.id,
					hostname: url.hostname,
					htmlHandling: config.html_handling,
					notFoundHandling: config.not_found_handling,
					userAgent: userAgent,
				});
			}

			return handleRequest(
				request,
				config,
				this.unstable_exists.bind(this),
				this.unstable_getByETag.bind(this)
			);
		} catch (err) {
			const response = new InternalServerErrorResponse(err as Error);

			// Log to Sentry if we can
			if (sentry) {
				sentry.captureException(err);
			}

			if (err instanceof Error) {
				analytics.setData({ error: err.message });
			}

			return response;
		} finally {
			analytics.setData({ requestTime: performance.now() - startTimeMs });
			analytics.write();
		}
	}

	async unstable_canFetch(request: Request): Promise<boolean> {
		const url = new URL(request.url);
		const decodedPathname = decodePath(url.pathname);
		const intent = await getIntent(
			decodedPathname,
			{
				...applyConfigurationDefaults(this.env.CONFIG),
				not_found_handling: "none",
			},
			this.unstable_exists.bind(this)
		);
		if (intent === null) {
			return false;
		}
		return true;
	}

	async unstable_getByETag(
		eTag: string
	): Promise<{ readableStream: ReadableStream; contentType: string }> {
		const asset = await getAssetWithMetadataFromKV(
			this.env.ASSETS_KV_NAMESPACE,
			eTag
		);

		if (!asset || !asset.value) {
			throw new Error(
				`Requested asset ${eTag} exists in the asset manifest but not in the KV namespace.`
			);
		}

		return {
			readableStream: asset.value,
			contentType: asset.metadata?.contentType ?? "application/octet-stream",
		};
	}

	async unstable_getByPathname(
		pathname: string
	): Promise<{ readableStream: ReadableStream; contentType: string } | null> {
		const eTag = await this.unstable_exists(pathname);
		if (!eTag) {
			return null;
		}

		return this.unstable_getByETag(eTag);
	}

	async unstable_exists(pathname: string): Promise<string | null> {
		const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);
		return await assetsManifest.get(pathname);
	}
}
