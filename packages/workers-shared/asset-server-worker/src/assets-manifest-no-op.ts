/**
 * This is the NOOP version of `AssetsManifest`, and is meant to be used
 * in local development only.
 *
 * The `NoopAssetsManifest` assumes a file path to file path mapping in
 * concept, which is why its `get` fn will always return the given pathname
 * unchanged.
 */
export class NoopAssetsManifest {
	async get(pathname: string) {
		return Promise.resolve(pathname);
	}
}
