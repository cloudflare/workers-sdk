import crypto from "crypto";
import { R2StringChecksums } from "@cloudflare/workers-types/experimental";
import {
	BadDigest,
	EntityTooLarge,
	InvalidMaxKeys,
	InvalidObjectName,
	MetadataTooLarge,
	PreconditionFailed,
} from "./errors";
import { R2Object, R2ObjectMetadata } from "./r2Object";
import { R2Conditional } from "./schemas";

export const MAX_LIST_KEYS = 1_000;
const MAX_KEY_SIZE = 1024;
// https://developers.cloudflare.com/r2/platform/limits/
const MAX_VALUE_SIZE = 5_000_000_000 - 5_000_000; // 5GB - 5MB
const MAX_METADATA_SIZE = 2048; // 2048B

function identity(ms: number) {
	return ms;
}
function truncateToSeconds(ms: number) {
	return Math.floor(ms / 1000) * 1000;
}

// Returns `true` iff the condition passed
/** @internal */
export function _testR2Conditional(
	cond: R2Conditional,
	metadata?: Pick<R2ObjectMetadata, "etag" | "uploaded">
): boolean {
	// Adapted from internal R2 gateway implementation.
	// See also https://datatracker.ietf.org/doc/html/rfc7232#section-6.

	if (metadata === undefined) {
		const ifMatch = cond.etagMatches === undefined;
		const ifModifiedSince = cond.uploadedAfter === undefined;
		return ifMatch && ifModifiedSince;
	}

	const { etag, uploaded: lastModifiedRaw } = metadata;
	const ifMatch = cond.etagMatches === undefined || cond.etagMatches === etag;
	const ifNoneMatch =
		cond.etagDoesNotMatch === undefined || cond.etagDoesNotMatch !== etag;

	const maybeTruncate = cond.secondsGranularity ? truncateToSeconds : identity;
	const lastModified = maybeTruncate(lastModifiedRaw);
	const ifModifiedSince =
		cond.uploadedAfter === undefined ||
		maybeTruncate(cond.uploadedAfter.getTime()) < lastModified ||
		(cond.etagDoesNotMatch !== undefined && ifNoneMatch);
	const ifUnmodifiedSince =
		cond.uploadedBefore === undefined ||
		lastModified < maybeTruncate(cond.uploadedBefore.getTime()) ||
		(cond.etagMatches !== undefined && ifMatch);

	return ifMatch && ifNoneMatch && ifModifiedSince && ifUnmodifiedSince;
}

export const R2_HASH_ALGORITHMS = [
	{ name: "MD5", field: "md5" },
	{ name: "SHA-1", field: "sha1" },
	{ name: "SHA-256", field: "sha256" },
	{ name: "SHA-384", field: "sha384" },
	{ name: "SHA-512", field: "sha512" },
] as const;
export type R2Hashes = Record<
	(typeof R2_HASH_ALGORITHMS)[number]["field"],
	Buffer | undefined
>;

function serialisedLength(x: string) {
	//  Adapted from internal R2 gateway implementation
	for (let i = 0; i < x.length; i++) {
		if (x.charCodeAt(i) >= 256) return x.length * 2;
	}
	return x.length;
}

export class Validator {
	hash(value: Uint8Array, hashes: R2Hashes): R2StringChecksums {
		const checksums: R2StringChecksums = {};
		for (const { name, field } of R2_HASH_ALGORITHMS) {
			const providedHash = hashes[field];
			if (providedHash !== undefined) {
				const computedHash = crypto.createHash(field).update(value).digest();
				if (!providedHash.equals(computedHash)) {
					throw new BadDigest(name, providedHash, computedHash);
				}
				// Store computed hash to ensure consistent casing in returned checksums
				// from `R2Object`
				checksums[field] = computedHash.toString("hex");
			}
		}
		return checksums;
	}

	condition(meta?: R2Object, onlyIf?: R2Conditional): Validator {
		if (onlyIf !== undefined && !_testR2Conditional(onlyIf, meta)) {
			let error = new PreconditionFailed();
			if (meta !== undefined) error = error.attach(meta);
			throw error;
		}
		return this;
	}

	size(value: Uint8Array): Validator {
		if (value.byteLength > MAX_VALUE_SIZE) {
			throw new EntityTooLarge();
		}
		return this;
	}

	metadataSize(customMetadata?: Record<string, string>): Validator {
		if (customMetadata === undefined) return this;
		let metadataLength = 0;
		for (const [key, value] of Object.entries(customMetadata)) {
			metadataLength += serialisedLength(key) + serialisedLength(value);
		}
		if (metadataLength > MAX_METADATA_SIZE) {
			throw new MetadataTooLarge();
		}
		return this;
	}

	key(key: string): Validator {
		const keyLength = Buffer.byteLength(key);
		if (keyLength >= MAX_KEY_SIZE) {
			throw new InvalidObjectName();
		}
		return this;
	}

	limit(limit?: number): Validator {
		if (limit !== undefined && (limit < 1 || limit > MAX_LIST_KEYS)) {
			throw new InvalidMaxKeys();
		}
		return this;
	}
}
