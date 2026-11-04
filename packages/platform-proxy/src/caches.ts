/*
 * A no-op Cache API rather than Miniflare's: Miniflare's cache would require Miniflare's own
 * `Request` and `Response` classes, while code using the platform proxy works with the ones
 * available in Node.js.
 */

// oxlint-disable-next-line typescript/no-explicit-any -- accepts any Request-like value, like the runtime
type CacheRequest = any;
// oxlint-disable-next-line typescript/no-explicit-any -- accepts any Response-like value, like the runtime
type CacheResponse = any;

type CacheQueryOptions = {
	ignoreMethod?: boolean;
};

/** No-op stand-in for a Workers `Cache` */
class Cache {
	async delete(
		_request: CacheRequest,
		_options?: CacheQueryOptions
	): Promise<boolean> {
		return false;
	}

	async match(
		_request: CacheRequest,
		_options?: CacheQueryOptions
	): Promise<CacheResponse | undefined> {
		return undefined;
	}

	async put(_request: CacheRequest, _response: CacheResponse): Promise<void> {}
}

/** No-op stand-in for the Workers `caches` global */
export class CacheStorage {
	constructor() {
		for (const method of ["has", "delete", "keys", "match"]) {
			Object.defineProperty(this, method, {
				enumerable: false,
				value: () => {
					throw new Error(
						`Failed to execute '${method}' on 'CacheStorage': the method is not implemented.`
					);
				},
			});
		}
		Object.defineProperty(this, "default", {
			enumerable: true,
			value: this.default,
		});
	}

	async open(_cacheName: string): Promise<Cache> {
		return new Cache();
	}

	get default(): Cache {
		return new Cache();
	}
}
