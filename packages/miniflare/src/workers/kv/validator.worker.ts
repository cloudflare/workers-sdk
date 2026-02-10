import { Buffer } from "node:buffer";
import { HttpError } from "miniflare:shared";
import { KVLimits, KVParams } from "./constants";

export function decodeKey({ key }: { key: string }, query: URLSearchParams) {
	if (query.get(KVParams.URL_ENCODED)?.toLowerCase() !== "true") return key;
	try {
		return decodeURIComponent(key);
	} catch (e: any) {
		if (e instanceof URIError) {
			throw new HttpError(400, "Could not URL-decode key name");
		} else {
			throw e;
		}
	}
}

export function validateKey(key: string): void {
	if (key === "") {
		throw new HttpError(400, "Key names must not be empty");
	}
	if (key === "." || key === "..") {
		throw new HttpError(
			400,
			`Illegal key name "${key}". Please use a different name.`
		);
	}
	validateKeyLength(key);
}

export function validateKeyLength(key: string): void {
	const keyLength = Buffer.byteLength(key);
	if (keyLength > KVLimits.MAX_KEY_SIZE_BYTES) {
		throw new HttpError(
			414,
			`UTF-8 encoded length of ${keyLength} exceeds key length limit of ${KVLimits.MAX_KEY_SIZE_BYTES}.`
		);
	}
}

export function validateGetOptions(
	key: string,
	options?: Omit<KVNamespaceGetOptions<never>, "type">
): void {
	validateKey(key);
	// Validate cacheTtl, but ignore it as there's only one "edge location":
	// the user's computer
	const cacheTtl = options?.cacheTtl;
	if (
		cacheTtl !== undefined &&
		(isNaN(cacheTtl) || cacheTtl < KVLimits.MIN_CACHE_TTL_SECONDS)
	) {
		throw new HttpError(
			400,
			`Invalid ${KVParams.CACHE_TTL} of ${cacheTtl}. Cache TTL must be at least ${KVLimits.MIN_CACHE_TTL_SECONDS}.`
		);
	}
}

export function validatePutOptions(
	key: string,
	options: {
		now: number /* seconds */;
		rawExpiration: string /* seconds */ | null;
		rawExpirationTtl: string /* seconds */ | null;
		rawMetadata: string /* JSON */ | null;
	}
): { expiration?: number /* seconds */; metadata?: unknown } {
	const { now, rawExpiration, rawExpirationTtl, rawMetadata } = options;

	validateKey(key);

	// Validate expiration
	let expiration: number | undefined;
	if (rawExpirationTtl !== null) {
		const expirationTtl = parseInt(rawExpirationTtl);
		if (Number.isNaN(expirationTtl) || expirationTtl <= 0) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.EXPIRATION_TTL} of ${rawExpirationTtl}. Please specify integer greater than 0.`
			);
		}
		if (expirationTtl < KVLimits.MIN_EXPIRATION_TTL_SECONDS) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.EXPIRATION_TTL} of ${rawExpirationTtl}. Expiration TTL must be at least ${KVLimits.MIN_EXPIRATION_TTL_SECONDS}.`
			);
		}
		expiration = now + expirationTtl;
	} else if (rawExpiration !== null) {
		expiration = parseInt(rawExpiration);
		if (Number.isNaN(expiration) || expiration <= now) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.EXPIRATION} of ${rawExpiration}. Please specify integer greater than the current number of seconds since the UNIX epoch.`
			);
		}
		if (expiration < now + KVLimits.MIN_EXPIRATION_TTL_SECONDS) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.EXPIRATION} of ${rawExpiration}. Expiration times must be at least ${KVLimits.MIN_EXPIRATION_TTL_SECONDS} seconds in the future.`
			);
		}
	}

	// Validate metadata size
	let metadata: unknown | undefined;
	if (rawMetadata !== null) {
		const metadataLength = Buffer.byteLength(rawMetadata);
		if (metadataLength > KVLimits.MAX_METADATA_SIZE_BYTES) {
			throw new HttpError(
				413,
				`Metadata length of ${metadataLength} exceeds limit of ${KVLimits.MAX_METADATA_SIZE_BYTES}.`
			);
		}
		metadata = JSON.parse(rawMetadata);
	}

	return { expiration, metadata };
}

export function decodeListOptions(url: URL) {
	const limitParam = url.searchParams.get(KVParams.LIST_LIMIT);
	const limit =
		limitParam === null ? KVLimits.MAX_LIST_KEYS : parseInt(limitParam);
	const prefix = url.searchParams.get(KVParams.LIST_PREFIX) ?? undefined;
	const cursor = url.searchParams.get(KVParams.LIST_CURSOR) ?? undefined;
	return { limit, prefix, cursor };
}

export function validateListOptions(options: KVNamespaceListOptions): void {
	// Validate key limit
	const limit = options.limit;
	if (limit !== undefined) {
		if (isNaN(limit) || limit < 1) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.LIST_LIMIT} of ${limit}. Please specify an integer greater than 0.`
			);
		}
		if (limit > KVLimits.MAX_LIST_KEYS) {
			throw new HttpError(
				400,
				`Invalid ${KVParams.LIST_LIMIT} of ${limit}. Please specify an integer less than ${KVLimits.MAX_LIST_KEYS}.`
			);
		}
	}

	// Validate key prefix
	const prefix = options.prefix;
	if (prefix != null) validateKeyLength(prefix);
}
