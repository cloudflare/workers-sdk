/* eslint-disable unused-imports/no-unused-vars */

/**
 * Note about this file:
 *
 * Here we are providing a no-op implementation of the runtime Cache API instead of using
 * the miniflare implementation (via `mf.getCaches()`).
 *
 * We are not using miniflare's implementation because that would require the user to provide
 * miniflare-specific Request objects and they would receive back miniflare-specific Response
 * objects, this (in particular the Request part) is not really suitable for `getPlatformProxy`
 * as people would ideally interact with their bindings in a very production-like manner and
 * requiring them to deal with miniflare-specific classes defeats a bit the purpose of the utility.
 *
 * Similarly the Request and Response types here are set to `undefined` as not to use specific ones
 * that would require us to make a choice right now or the user to adapt their code in order to work
 * with the api.
 *
 * We need to find a better/generic manner in which we can reuse the miniflare cache implementation,
 * but until then the no-op implementation below will have to do.
 */

/**
 * No-op implementation of CacheStorage
 */
export class CacheStorage {
	constructor() {
		const unsupportedMethods = ["has", "delete", "keys", "match"];
		unsupportedMethods.forEach((method) => {
			Object.defineProperty(this, method, {
				enumerable: false,
				value: () => {
					throw new Error(
						`Failed to execute '${method}' on 'CacheStorage': the method is not implemented.`
					);
				},
			});
		});
		Object.defineProperty(this, "default", {
			enumerable: true,
			value: this.default,
		});
	}

	async open(cacheName: string): Promise<Cache> {
		return new Cache();
	}

	get default(): Cache {
		return new Cache();
	}
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   In order to make the API convenient to use in and Node.js programs we try not to
   restrict the types that's why we're using `any`s as the request/response types
   (making this API flexible and compatible with the cache types in `@cloudflare/workers-types`)
*/
type CacheRequest = any;
type CacheResponse = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * No-op implementation of Cache
 */
class Cache {
	async delete(
		request: CacheRequest,
		options?: CacheQueryOptions
	): Promise<boolean> {
		return false;
	}

	async match(
		request: CacheRequest,
		options?: CacheQueryOptions
	): Promise<CacheResponse | undefined> {
		return undefined;
	}

	async put(request: CacheRequest, response: CacheResponse): Promise<void> {}
}

type CacheQueryOptions = {
	ignoreMethod?: boolean;
};
