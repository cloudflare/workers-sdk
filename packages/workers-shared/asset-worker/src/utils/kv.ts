import type { Toucan } from "toucan-js";

export type AssetMetadata = {
	contentType: string;
};

export async function getAssetWithMetadataFromKV(
	assetsKVNamespace: KVNamespace,
	assetKey: string,
	sentry?: Toucan,
	retries = 1
) {
	let attempts = 0;

	while (attempts <= retries) {
		try {
			const asset = await assetsKVNamespace.getWithMetadata<AssetMetadata>(
				assetKey,
				{
					type: "stream",
					cacheTtl: 31536000, // 1 year
				}
			);

			if (asset.value === null) {
				// Don't cache a 404 for a year by re-requesting with a minimum cacheTtl
				const retriedAsset =
					await assetsKVNamespace.getWithMetadata<AssetMetadata>(assetKey, {
						type: "stream",
						cacheTtl: 60, // Minimum value allowed
					});

				if (retriedAsset.value !== null && sentry) {
					sentry.captureException(
						new Error(
							`Initial request for asset ${assetKey} failed, but subsequent request succeeded.`
						)
					);
				}

				return retriedAsset;
			}
			return asset;
		} catch (err) {
			if (attempts >= retries) {
				throw new Error(
					`Requested asset ${assetKey} could not be fetched from KV namespace.`
				);
			}

			// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
			);
		}
	}
}
