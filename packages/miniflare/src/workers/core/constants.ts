export const CoreHeaders = {
	CUSTOM_FETCH_SERVICE: "MF-Custom-Fetch-Service",
	CUSTOM_NODE_SERVICE: "MF-Custom-Node-Service",
	ORIGINAL_URL: "MF-Original-URL",
	/**
	 * Stores the original hostname when using the `upstream` option.
	 * When requests are proxied to an upstream, the `Host` header is rewritten
	 * to match the upstream. This header preserves the original hostname
	 * so Workers can access it if needed.
	 */
	ORIGINAL_HOSTNAME: "MF-Original-Hostname",
	PROXY_SHARED_SECRET: "MF-Proxy-Shared-Secret",
	DISABLE_PRETTY_ERROR: "MF-Disable-Pretty-Error",
	ERROR_STACK: "MF-Experimental-Error-Stack",
	ROUTE_OVERRIDE: "MF-Route-Override",
	CF_BLOB: "MF-CF-Blob",
	/** Used by the Vite plugin to pass through the original `sec-fetch-mode` header */
	SEC_FETCH_MODE: "MF-Sec-Fetch-Mode",

	// API Proxy
	OP_SECRET: "MF-Op-Secret",
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
	SERVICE_LOCAL_EXPLORER: "MINIFLARE_LOCAL_EXPLORER",
	TEXT_CUSTOM_SERVICE: "MINIFLARE_CUSTOM_SERVICE",
	IMAGES_SERVICE: "MINIFLARE_IMAGES_SERVICE",
	TEXT_UPSTREAM_URL: "MINIFLARE_UPSTREAM_URL",
	JSON_CF_BLOB: "CF_BLOB",
	JSON_ROUTES: "MINIFLARE_ROUTES",
	JSON_LOG_LEVEL: "MINIFLARE_LOG_LEVEL",
	DATA_LIVE_RELOAD_SCRIPT: "MINIFLARE_LIVE_RELOAD_SCRIPT",
	DURABLE_OBJECT_NAMESPACE_PROXY: "MINIFLARE_PROXY",
	DATA_PROXY_SECRET: "MINIFLARE_PROXY_SECRET",
	DATA_PROXY_SHARED_SECRET: "MINIFLARE_PROXY_SHARED_SECRET",
	TRIGGER_HANDLERS: "TRIGGER_HANDLERS",
	LOG_REQUESTS: "LOG_REQUESTS",
	STRIP_DISABLE_PRETTY_ERROR: "STRIP_DISABLE_PRETTY_ERROR",
} as const;

export const ProxyOps = {
	// Get the target or a property of the target
	GET: "GET",
	// Get the descriptor for a property of the target
	GET_OWN_DESCRIPTOR: "GET_OWN_DESCRIPTOR",
	// Get the target's own property names
	GET_OWN_KEYS: "GET_OWN_KEYS",
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
	// `DurableObject` and `WorkerRpc` are the internal names of `DurableObjectStub`:
	// https://github.com/cloudflare/workerd/blob/62b9ceee4c94d2b238692397dc4f604fef84f474/src/workerd/api/actor.h#L86
	// https://github.com/cloudflare/workerd/blob/62b9ceee4c94d2b238692397dc4f604fef84f474/src/workerd/api/worker-rpc.h#L30
	return (
		(targetName === "Fetcher" ||
			targetName === "DurableObject" ||
			targetName === "WorkerRpc") &&
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

/**
 * See #createMediaProxy() comment for why this is special
 */
export function isImagesInput(targetName: string, key: string) {
	return targetName === "ImagesBindingImpl" && key === "input";
}

// Durable Object stub RPC calls should always be async to avoid blocking the
// Node.js event loop. The internal names are "DurableObject" and "WorkerRpc".
// https://github.com/cloudflare/workerd/blob/62b9ceee/src/workerd/api/actor.h#L86
// https://github.com/cloudflare/workerd/blob/62b9ceee/src/workerd/api/worker-rpc.h#L30
export function isDurableObjectStub(targetName: string) {
	return targetName === "DurableObject" || targetName === "WorkerRpc";
}
