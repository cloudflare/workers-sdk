import { WorkerEntrypoint } from "cloudflare:workers";
import { setupSentry } from "../../utils/sentry";
import { AssetsManifest } from "./assets-manifest";
import { applyConfigurationDefaults } from "./configuration";
import { decodePath, getIntent, handleRequest } from "./handler";
import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
} from "./responses";
import { getAssetWithMetadataFromKV } from "./utils/kv";
import type { AssetConfig } from "../../utils/types";

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
		try {
			sentry = setupSentry(
				request,
				this.ctx,
				this.env.SENTRY_DSN,
				this.env.SENTRY_ACCESS_CLIENT_ID,
				this.env.SENTRY_ACCESS_CLIENT_SECRET
			);

			return handleRequest(
				request,
				applyConfigurationDefaults(this.env.CONFIG),
				this.unstable_exists.bind(this),
				this.unstable_getByETag.bind(this)
			);
		} catch (err) {
			const response = new InternalServerErrorResponse(err as Error);

			// Log to Sentry if we can
			if (sentry) {
				sentry.captureException(err);
			}

			return response;
		}
	}

	async unstable_canFetch(request: Request): Promise<boolean | Response> {
		const url = new URL(request.url);
		const method = request.method.toUpperCase();
		const decodedPathname = decodePath(url.pathname);
		const intent = await getIntent(
			decodedPathname,
			{
				...applyConfigurationDefaults(this.env.CONFIG),
				not_found_handling: "none",
			},
			this.unstable_exists.bind(this)
		);
		// if asset exists but non GET/HEAD method, 405
		if (intent && ["GET", "HEAD"].includes(method)) {
			return new MethodNotAllowedResponse();
		}
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
