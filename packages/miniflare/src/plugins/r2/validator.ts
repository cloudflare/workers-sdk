import assert from "assert";
import { R2StringChecksums } from "@cloudflare/workers-types/experimental";
import { InclusiveRange } from "../../storage2";
import { _parseRanges } from "../shared";
import {
	BadDigest,
	EntityTooLarge,
	InvalidMaxKeys,
	InvalidObjectName,
	InvalidRange,
	MetadataTooLarge,
	PreconditionFailed,
} from "./errors";
import { R2Object } from "./r2Object";
import { R2Conditional, R2GetOptions } from "./schemas";

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
	metadata?: Pick<R2Object, "etag" | "uploaded">
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
	hash(digests: Map<string, Buffer>, hashes: R2Hashes): R2StringChecksums {
		const checksums: R2StringChecksums = {};
		for (const { name, field } of R2_HASH_ALGORITHMS) {
			const providedHash = hashes[field];
			if (providedHash !== undefined) {
				const computedHash = digests.get(field);
				// Should've computed all required digests
				assert(computedHash !== undefined);
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

	condition(
		meta?: R2Object | Pick<R2Object, "etag" | "uploaded">,
		onlyIf?: R2Conditional
	): Validator {
		if (onlyIf !== undefined && !_testR2Conditional(onlyIf, meta)) {
			let error = new PreconditionFailed();
			if (meta instanceof R2Object) error = error.attach(meta);
			throw error;
		}
		return this;
	}

	range(
		options: Pick<R2GetOptions, "rangeHeader" | "range">,
		size: number
	): InclusiveRange | undefined {
		if (options.rangeHeader !== undefined) {
			const ranges = _parseRanges(options.rangeHeader, size);
			// If the header contained a single range, use it. Otherwise, if the
			// header was invalid, or contained multiple ranges, just return the full
			// response.
			if (ranges?.length === 1) {
				const [start, end] = ranges[0];
				return { start, end };
			}
		} else if (options.range !== undefined) {
			let { offset, length, suffix } = options.range;
			// Eliminate suffix is specified
			if (suffix !== undefined) {
				if (suffix <= 0) throw new InvalidRange();
				if (suffix > size) suffix = size;
				offset = size - suffix;
				length = suffix;
			}
			// Validate offset and length
			if (offset === undefined) offset = 0;
			if (length === undefined) length = size - offset;
			if (offset < 0 || offset > size || length <= 0) throw new InvalidRange();
			// Clamp length to maximum
			if (offset + length > size) length = size - offset;
			// Convert to inclusive range
			return { start: offset, end: offset + length - 1 }; // TODO: check -1
		}
	}

	size(size: number): Validator {
		if (size > MAX_VALUE_SIZE) {
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
