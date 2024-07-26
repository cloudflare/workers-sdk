export const R2Limits = {
	MAX_LIST_KEYS: 1_000,
	MAX_KEY_SIZE: 1024,
	// https://developers.cloudflare.com/r2/platform/limits/
	MAX_VALUE_SIZE: 5_368_709_120 - 5_242_880, // 5 GiB - 5 MiB
	MAX_METADATA_SIZE: 2048, // 2048 B
	MIN_MULTIPART_PART_SIZE: 5 * 1024 * 1024,
	MIN_MULTIPART_PART_SIZE_TEST: 50,
} as const;

export const R2Headers = {
	ERROR: "cf-r2-error",
	REQUEST: "cf-r2-request",
	METADATA_SIZE: "cf-r2-metadata-size",
} as const;
