export const CoreHeaders = {
	CUSTOM_SERVICE: "MF-Custom-Service",
	ORIGINAL_URL: "MF-Original-URL",
	ERROR_STACK: "MF-Experimental-Error-Stack",
	ROUTE_OVERRIDE: "MF-Route-Override",
	CUSTOM_EVENT: "MF-Custom-Event",

	// API Proxy
	OP: "MF-Op",
	OP_TARGET: "MF-Op-Target",
	OP_KEY: "MF-Op-Key",
	OP_SYNC: "MF-Op-Sync",
	OP_STRINGIFIED_SIZE: "MF-Op-Stringified-Size",
	OP_RESULT_TYPE: "MF-Op-Result-Type",
} as const;

export const CoreBindings = {
	SERVICE_LOOPBACK: "MINIFLARE_LOOPBACK",
	SERVICE_USER_ROUTE_PREFIX: "MINIFLARE_USER_ROUTE_",
	SERVICE_USER_FALLBACK: "MINIFLARE_USER_FALLBACK",
	TEXT_CUSTOM_SERVICE: "MINIFLARE_CUSTOM_SERVICE",
	TEXT_UPSTREAM_URL: "MINIFLARE_UPSTREAM_URL",
	JSON_CF_BLOB: "CF_BLOB",
	JSON_ROUTES: "MINIFLARE_ROUTES",
	JSON_LOG_LEVEL: "MINIFLARE_LOG_LEVEL",
	DATA_LIVE_RELOAD_SCRIPT: "MINIFLARE_LIVE_RELOAD_SCRIPT",
	DURABLE_OBJECT_NAMESPACE_PROXY: "MINIFLARE_PROXY",
} as const;

export const ProxyOps = {
	// Get the target or a property of the target
	GET: "GET",
	// Call a method on the target
	CALL: "CALL",
	// Remove the strong reference to the target on the "heap", allowing it to be
	// garbage collected
	FREE: "FREE",
} as const;
export const ProxyAddresses = {
	GLOBAL: 0, // globalThis
	ENV: 1, // env
	USER_START: 2,
} as const;

// ### Proxy Special Cases
// The proxy supports serialising `Request`/`Response`s for the Cache API. It
// doesn't support serialising `WebSocket`s though. Rather than attempting this,
// we call `Fetcher#fetch()` using `dispatchFetch()` directly, using the passed
// request. This gives us WebSocket support, and is much more efficient, since
// there's no need to serialise the `Request`/`Response`: we just pass
// everything to `dispatchFetch()` and return what that gives us.
export function isFetcherFetch(targetName: string, key: string) {
	// `DurableObject` is the internal name of `DurableObjectStub`:
	// https://github.com/cloudflare/workerd/blob/34e3f96dae6a4ba799fe0ab9ad9f3f5a88633fc7/src/workerd/api/actor.h#L86
	return (
		(targetName === "Fetcher" || targetName === "DurableObject") &&
		key === "fetch"
	);
}
// `R2Object#writeHttpMetadata()` is one of the few functions that mutates its
// arguments. This would be proxied correctly if the argument were a native
// target proxy itself, but `Headers` can be constructed in Node. Instead, we
// respond with the updated headers in the proxy server, then copy them to the
// original argument on the client.
export function isR2ObjectWriteHttpMetadata(targetName: string, key: string) {
	// `HeadResult` and `GetResult` are the internal names of `R2Object` and `R2ObjectBody` respectively:
	// https://github.com/cloudflare/workerd/blob/ae612f0563d864c82adbfa4c2e5ed78b547aa0a1/src/workerd/api/r2-bucket.h#L210
	// https://github.com/cloudflare/workerd/blob/ae612f0563d864c82adbfa4c2e5ed78b547aa0a1/src/workerd/api/r2-bucket.h#L263-L264
	return (
		(targetName === "HeadResult" || targetName === "GetResult") &&
		key === "writeHttpMetadata"
	);
}
