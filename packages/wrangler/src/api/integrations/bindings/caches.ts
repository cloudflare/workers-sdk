/* eslint-disable unused-imports/no-unused-vars */

/**
 * Note about this file:
 *
 * Here we are providing a no-op implementation of the runtime Cache API instead of using
 * the miniflare implementation (via `mf.getCaches()`).
 *
 * We are not using miniflare's implementation because that would require the user to provide
 * miniflare-specific Request objects and they would receive back miniflare-specific Response
 * objects, this (in particular the Request part) is not really suitable for `getBindingsProxy`
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
	async open(cacheName: string): Promise<Cache> {
		return new Cache();
	}

	get default(): Cache {
		return new Cache();
	}
}

type CacheRequest = unknown;
type CacheResponse = unknown;

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
