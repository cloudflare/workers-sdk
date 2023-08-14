export const CacheHeaders = {
	NAMESPACE: "cf-cache-namespace",
	STATUS: "cf-cache-status",
} as const;

export const CacheBindings = {
	MAYBE_JSON_CACHE_WARN_USAGE: "MINIFLARE_CACHE_WARN_USAGE",
} as const;

export interface CacheObjectCf {
	miniflare?: { cacheWarnUsage?: boolean };
}
