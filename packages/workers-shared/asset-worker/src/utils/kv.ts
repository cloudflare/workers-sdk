import type { Toucan } from "toucan-js";

export type AssetMetadata = {
	contentType: string;
};

// The first read of a hot asset can be cached for a long time. Any retry,
// however, is the result of a null or an error, so we cache those with a short
// TTL to avoid caching a transient 404 for a year.
const LONG_CACHE_TTL = 31536000; // 1 year
const SHORT_CACHE_TTL = 60; // Minimum value allowed by KV

// Jittered exponential backoff bounds, in milliseconds. Kept deliberately
// small: a single page load can fan out into hundreds of asset requests, so
// long per-request stalls would be catastrophic for page load time. Full
// jitter (random between 0 and the current ceiling) avoids synchronised
// retries stampeding a storage provider that is still catching up.
const BACKOFF_BASE_MS = 50;
const BACKOFF_CAP_MS = 1000;

function backoffDelayMs(attempt: number): number {
	const ceiling = Math.min(
		BACKOFF_CAP_MS,
		BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
	);
	return Math.random() * ceiling;
}

export async function getAssetWithMetadataFromKV(
	assetsKVNamespace: KVNamespace,
	assetKey: string,
	sentry?: Toucan,
	retries = 3
) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		const isRetry = attempt > 0;

		// Back off before every attempt after the first.
		if (isRetry) {
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, backoffDelayMs(attempt))
			);
		}

		try {
			const asset = await assetsKVNamespace.getWithMetadata<AssetMetadata>(
				assetKey,
				{
					type: "stream",
					cacheTtl: isRetry ? SHORT_CACHE_TTL : LONG_CACHE_TTL,
				}
			);

			if (asset.value === null) {
				// The asset key is taken from the manifest, so a null here almost
				// always means the value has not yet propagated to the KV storage
				// provider we read from (the eventual-consistency window right after
				// a deploy). Retry with backoff to give propagation time to complete.
				if (attempt < retries) {
					continue;
				}

				// Out of retries. Return the (null) result and let the caller decide
				// how to surface it. With the default retries (>= 1) this final read
				// used the short TTL, so we never cache a null for the long TTL.
				return asset;
			}

			if (isRetry && sentry) {
				sentry.captureException(
					new Error(
						`Initial request for asset ${assetKey} failed, but subsequent request succeeded.`
					)
				);
			}

			return asset;
		} catch (err) {
			if (attempt >= retries) {
				let message = `KV GET ${assetKey} failed.`;
				if (err instanceof Error) {
					message = `KV GET ${assetKey} failed: ${err.message}`;
				}
				throw new Error(message);
			}

			// Otherwise fall through to the next iteration and retry after backoff.
		}
	}
}
