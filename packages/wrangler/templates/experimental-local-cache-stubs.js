// `workerd` currently throws on any use of the Cache API. Workers Sites
// requires the Cache API to function though, so stub it out to no-ops, like in
// regular `wrangler dev`.

class Cache {
	async put(req, res) {}

	async match(req, options) {}

	async delete(req, options) {
		return false;
	}
}

class CacheStorage {
	#cache = new Cache();

	get default() {
		return this.#cache;
	}

	async open(cacheName) {
		return this.#cache;
	}
}

globalThis.caches = new CacheStorage();
