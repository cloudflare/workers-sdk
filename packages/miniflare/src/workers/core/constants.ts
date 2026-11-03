/**
 * Reserved paths for internal Miniflare endpoints.
 *
 * Paths under `/cdn-cgi/local/` are reserved by Cloudflare's network
 * and won't conflict with user routes. Paths under `/__cf_local/` live
 * outside `/cdn-cgi/` so they remain reachable over tunnels.
 */
export const CorePaths = {
	/** Magic proxy used by getPlatformProxy */
	PLATFORM_PROXY: "/cdn-cgi/local/platform-proxy",
	/** Trigger scheduled event handlers */
	SCHEDULED: "/cdn-cgi/local/scheduled",
	/** Trigger email event handlers */
	EMAIL: "/cdn-cgi/local/email",
	/** Local explorer UI and API */
	EXPLORER: "/cdn-cgi/local/explorer",
	/** Stream video serving endpoint (outside /cdn-cgi/ for tunnel access) */
	STREAM_VIDEO: "/__cf_local/stream",
	/** Local image delivery endpoint (outside /cdn-cgi/ for tunnel access) */
	IMAGE_DELIVERY: "/__cf_local/imagedelivery",
	/** Local Direct Creator Upload completion endpoint (outside /cdn-cgi/ for tunnel access) */
	IMAGE_UPLOAD: "/__cf_local/imageupload",
	/** Public R2 bucket object serving endpoint */
	R2_PUBLIC: "/cdn-cgi/local/r2/public",
	/** S3-compatible API endpoint for local R2 buckets */
	R2_S3: "/cdn-cgi/local/r2/s3",
} as const;

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
	DEV_REGISTRY_SECRET: "MF-Dev-Registry-Secret",
	LOOPBACK_SECRET: "MF-Loopback-Secret",
	DISABLE_PRETTY_ERROR: "MF-Disable-Pretty-Error",
	ERROR_STACK: "MF-Experimental-Error-Stack",
	/**
	 * The serialised error, URI-encoded. `workerd` drops response bodies for
	 * `HEAD` requests, so the body alone cannot carry the error out of the user
	 * Worker. Producers set this in addition to the body; consumers fall back to
	 * it whenever the body is unavailable.
	 */
	ERROR_STACK_PAYLOAD: "MF-Experimental-Error-Stack-Payload",
	ROUTE_OVERRIDE: "MF-Route-Override",
	CF_BLOB: "MF-CF-Blob",
	ACCESS_BLOB: "MF-Access-Blob",
	/** Used by the Vite plugin to pass through the original `sec-fetch-mode` header */
	SEC_FETCH_MODE: "MF-Sec-Fetch-Mode",

	// API Proxy
	OP_SECRET: "MF-Op-Secret",
	OP: "MF-Op",
	OP_TARGET: "MF-Op-Target",
	OP_ORIGINAL_URL: "MF-Op-Original-URL",
} as const;

export const CoreBindings = {
	SERVICE_LOOPBACK: "MINIFLARE_LOOPBACK",
	SERVICE_USER_ROUTE_PREFIX: "MINIFLARE_USER_ROUTE_",
	SERVICE_USER_FALLBACK: "MINIFLARE_USER_FALLBACK",
	TEXT_CUSTOM_SERVICE: "MINIFLARE_CUSTOM_SERVICE",
	// Backs the Images binding (`env.IMAGES`) — see imagesLocalFetcher.
	IMAGES_BINDING_SERVICE: "MINIFLARE_IMAGES_BINDING_SERVICE",
	// Backs `fetch(url, { cf: { image } })` transforms — see cfImageLocalFetcher.
	IMAGES_FETCH_SERVICE: "MINIFLARE_IMAGES_FETCH_SERVICE",
	TEXT_UPSTREAM_URL: "MINIFLARE_UPSTREAM_URL",
	JSON_CF_BLOB: "CF_BLOB",
	JSON_ROUTES: "MINIFLARE_ROUTES",
	JSON_LOG_LEVEL: "MINIFLARE_LOG_LEVEL",
	DURABLE_OBJECT_NAMESPACE_PROXY: "MINIFLARE_PROXY",
	DATA_PROXY_SECRET: "MINIFLARE_PROXY_SECRET",
	DATA_PROXY_SHARED_SECRET: "MINIFLARE_PROXY_SHARED_SECRET",
	DATA_DEV_REGISTRY_SECRET: "MINIFLARE_DEV_REGISTRY_SECRET",
	TRIGGER_HANDLERS: "TRIGGER_HANDLERS",
	LOG_REQUESTS: "LOG_REQUESTS",
	STRIP_DISABLE_PRETTY_ERROR: "STRIP_DISABLE_PRETTY_ERROR",
	SERVICE_LOCAL_EXPLORER: "MINIFLARE_LOCAL_EXPLORER",
	EXPLORER_DISK: "MINIFLARE_EXPLORER_DISK",
	JSON_LOCAL_EXPLORER_BINDING_MAP: "LOCAL_EXPLORER_BINDING_MAP",
	JSON_LOCAL_EXPLORER_WORKER_NAMES: "LOCAL_EXPLORER_WORKER_NAMES",
	JSON_EXPLORER_WORKER_OPTS: "MINIFLARE_EXPLORER_WORKER_OPTS",
	SERVICE_CACHE: "MINIFLARE_CACHE",
	SERVICE_DEV_CONTROL: "MINIFLARE_DEV_CONTROL",
	SERVICE_DEV_REGISTRY_PROXY: "MINIFLARE_DEV_REGISTRY_PROXY",
	JSON_TELEMETRY_CONFIG: "MINIFLARE_TELEMETRY_CONFIG",
	DEV_REGISTRY_DEBUG_PORT: "DEV_REGISTRY_DEBUG_PORT",
	DEV_REGISTRY_INSTANCE_ID: "DEV_REGISTRY_INSTANCE_ID",
	SERVICE_STREAM: "MINIFLARE_STREAM",
	SERVICE_IMAGES_DELIVERY: "MINIFLARE_IMAGES_DELIVERY",
	SERVICE_D1: "MINIFLARE_D1",
	SERVICE_FLAGSHIP: "MINIFLARE_FLAGSHIP",
	SERVICE_KV: "MINIFLARE_KV",
	SERVICE_R2: "MINIFLARE_R2",
	SERVICE_R2_PUBLIC: "MINIFLARE_R2_PUBLIC",
	SERVICE_R2_S3: "MINIFLARE_R2_S3",
	SERVICE_OBSERVABILITY_COLLECTOR: "MINIFLARE_OBSERVABILITY_COLLECTOR",
	JSON_ACCESS_BLOB_PREFIX: "MINIFLARE_ACCESS_BLOB_",
	TEXT_FALLBACK_WORKER_NAME: "MINIFLARE_FALLBACK_WORKER_NAME",
	SERVICE_EMAIL_STORE: "MINIFLARE_EMAIL_STORE",
	// Prefix for the local explorer's direct service bindings to each user
	// worker in this instance to invoke handlers (e.g email()).
	SERVICE_EXPLORER_USER_WORKER_PREFIX: "MINIFLARE_EXPLORER_USER_WORKER_",
} as const;

export const ProxyOps = {
	// Open the Cap'n Web WebSocket session used for all asynchronous operations
	CONNECT: "CONNECT",
	// Get a value a synchronous API must return (see `ProxySyncRequest`)
	SYNC: "SYNC",
	// Call `fetch()` on a `Fetcher` or Durable Object stub, identified by a token
	// in `CoreHeaders.OP_TARGET`. Sent with `dispatchFetch()` rather than Cap'n
	// Web, as this supports WebSockets, and the request and response don't need
	// to be serialised.
	FETCH: "FETCH",
} as const;

/**
 * How `ProxyServer` revives a `DurableObjectId` created in Node.js: from a
 * name, or a string returned by `DurableObjectId#toString()`.
 */
export type ProxyDurableObjectId = ["name" | "string", string];

/**
 * Main interface `ProxyServer` exposes over its Cap'n Web session.
 */
export interface ProxyRpcApi {
	/**
	 * Returns the names of the classes of bindings in the `ProxyServer`'s `env`
	 * that must be used through stubs, by binding name.
	 */
	describeEnv(): Record<string, string>;
	/** Returns a stub for the object bound to `name`. */
	getEnv(name: string): unknown;
	/** Returns a stub for the global `CacheStorage`. */
	getCaches(): unknown;
	/**
	 * Returns a stub for a D1 session. `token` identifies the session in
	 * `ProxySyncRequest`s.
	 */
	getD1Session(
		binding: string,
		constraint: string | undefined,
		token: string
	): unknown;
}

/** Request for a value a synchronous API must return. */
export type ProxySyncRequest =
	| {
			type: "DurableObjectId#toString";
			binding: string;
			id: ProxyDurableObjectId;
	  }
	| {
			type: "DurableObjectNamespace#newUniqueId";
			binding: string;
			options?: unknown;
	  }
	| {
			type: "D1DatabaseSession#getBookmark";
			binding: string;
			constraint: string | undefined;
			token: string;
	  };

/**
 * Recovers the serialised error a Worker put in `ERROR_STACK_PAYLOAD`, for the
 * cases where the response body carrying it has been dropped (`HEAD` requests).
 * Returns `null` when the header is absent or malformed, so callers can fall
 * back rather than surfacing a decoding failure as the Worker's error.
 */
export function decodeErrorPayload(response: {
	headers: { get(name: string): string | null };
}): string | null {
	const payload = response.headers.get(CoreHeaders.ERROR_STACK_PAYLOAD);
	if (payload === null) {
		return null;
	}
	try {
		return decodeURIComponent(payload);
	} catch {
		return null;
	}
}
