export type AssetMetadata = {
	contentType: string;
};

export async function getAssetWithMetadataFromKV(
	assetsKVNamespace: KVNamespace,
	assetKey: string,
	retries = 1
) {
	let attempts = 0;

	while (attempts <= retries) {
		try {
			return await assetsKVNamespace.getWithMetadata<AssetMetadata>(assetKey, {
				type: "stream",
				cacheTtl: 31536000, // 1 year
			});
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
