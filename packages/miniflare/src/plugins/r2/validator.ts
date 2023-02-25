import crypto from "crypto";
import { R2StringChecksums } from "@cloudflare/workers-types/experimental";
import {
	BadDigest,
	EntityTooLarge,
	InvalidMaxKeys,
	InvalidObjectName,
	PreconditionFailed,
} from "./errors";
import { R2Object, R2ObjectMetadata } from "./r2Object";
import { R2Conditional } from "./schemas";

export const MAX_LIST_KEYS = 1_000;
const MAX_KEY_SIZE = 1024;

const UNPAIRED_SURROGATE_PAIR_REGEX =
	/^(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])$/;
const MAX_VALUE_SIZE = 5 * 1_000 * 1_000 * 1_000 - 5 * 1_000 * 1_000;

// false -> the condition testing "failed"
function testR2Conditional(
	conditional?: R2Conditional,
	metadata?: R2ObjectMetadata
): boolean {
	const { etagMatches, etagDoesNotMatch, uploadedBefore, uploadedAfter } =
		conditional ?? {};

	// If the object doesn't exist
	if (metadata === undefined) {
		// the etagDoesNotMatch and uploadedBefore automatically pass
		// etagMatches and uploadedAfter automatically fail if they exist
		return etagMatches === undefined && uploadedAfter === undefined;
	}

	const { etag, uploaded } = metadata;

	// ifMatch check
	const ifMatch = etagMatches ? etagMatches === etag : null;
	if (ifMatch === false) return false;

	// ifNoMatch check
	const ifNoneMatch = etagDoesNotMatch ? etagDoesNotMatch !== etag : null;

	if (ifNoneMatch === false) return false;

	// ifUnmodifiedSince check
	if (
		ifMatch !== true && // if "ifMatch" is true, we ignore date checking
		uploadedBefore !== undefined &&
		uploaded > uploadedBefore.getTime()
	) {
		return false;
	}

	// ifModifiedSince check
	if (
		ifNoneMatch !== true && // if "ifNoneMatch" is true, we ignore date checking
		uploadedAfter !== undefined &&
		uploaded < uploadedAfter.getTime()
	) {
		return false;
	}

	return true;
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
		if (onlyIf !== undefined && !testR2Conditional(onlyIf, meta)) {
			let error = new PreconditionFailed();
			if (meta !== undefined) error = error.attach(meta);
			throw error;
		}
		return this;
	}

	size(value: Uint8Array): Validator {
		// TODO: should we be validating httpMetadata/customMetadata size too
		if (value.byteLength > MAX_VALUE_SIZE) {
			throw new EntityTooLarge();
		}
		return this;
	}

	key(key: string): Validator {
		// Check key isn't too long and exists outside regex
		const keyLength = Buffer.byteLength(key);
		if (UNPAIRED_SURROGATE_PAIR_REGEX.test(key)) {
			throw new InvalidObjectName();
		}
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
