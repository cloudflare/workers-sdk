export const KV_PLUGIN_NAME = "kv";

export const MIN_CACHE_TTL = 60; /* 60s */
export const MAX_LIST_KEYS = 1000;
export const MAX_KEY_SIZE = 512; /* 512B */
export const MAX_VALUE_SIZE = 25 * 1024 * 1024; /* 25MiB */
export const MAX_METADATA_SIZE = 1024; /* 1KiB */

export const PARAM_URL_ENCODED = "urlencoded";
export const PARAM_CACHE_TTL = "cache_ttl";
export const PARAM_EXPIRATION = "expiration";
export const PARAM_EXPIRATION_TTL = "expiration_ttl";
export const PARAM_LIST_LIMIT = "key_count_limit";
export const PARAM_LIST_PREFIX = "prefix";
export const PARAM_LIST_CURSOR = "cursor";

export const HEADER_EXPIRATION = "CF-Expiration";
export const HEADER_METADATA = "CF-KV-Metadata";
export const HEADER_SITES = "MF-Sites";
