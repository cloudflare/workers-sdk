import crypto from "crypto";
import {
	BadDigest,
	EntityTooLarge,
	InternalError,
	InvalidDigest,
	InvalidMaxKeys,
	InvalidObjectName,
	PreconditionFailed,
} from "./errors";
import {
	R2Conditional,
	R2GetOptions,
	R2ListOptions,
	R2PutOptions,
} from "./gateway";

import { R2HTTPMetadata, R2Object, R2ObjectMetadata } from "./r2Object";

const MAX_LIST_KEYS = 1_000;
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
		uploaded > uploadedBefore
	) {
		return false;
	}

	// ifModifiedSince check
	if (
		ifNoneMatch !== true && // if "ifNoneMatch" is true, we ignore date checking
		uploadedAfter !== undefined &&
		uploaded < uploadedAfter
	) {
		return false;
	}

	return true;
}
export class Validator {
	md5(value: Uint8Array, md5?: string): string {
		const md5Hash = crypto.createHash("md5").update(value).digest("base64");
		if (md5 !== undefined && md5 !== md5Hash) {
			throw new BadDigest();
		}
		return md5Hash;
	}
	condition(meta: R2Object, onlyIf?: R2Conditional): Validator {
		// test conditional should it exist
		if (!testR2Conditional(onlyIf, meta) || meta?.size === 0) {
			throw new PreconditionFailed().attach(meta);
		}
		return this;
	}
	size(value: Uint8Array): Validator {
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

	onlyIf(onlyIf: R2Conditional): Validator {
		if (typeof onlyIf !== "object") {
			throw new InternalError().context(
				"onlyIf must be an object, a Headers instance, or undefined."
			);
		}

		// Check onlyIf variables
		const { etagMatches, etagDoesNotMatch, uploadedBefore, uploadedAfter } =
			onlyIf;
		if (
			etagMatches !== undefined &&
			!(typeof etagMatches === "string" || Array.isArray(etagMatches))
		) {
			throw new InternalError().context("etagMatches must be a string.");
		}
		if (
			etagDoesNotMatch !== undefined &&
			!(typeof etagDoesNotMatch === "string" || Array.isArray(etagDoesNotMatch))
		) {
			throw new InternalError().context("etagDoesNotMatch must be a string.");
		}
		if (uploadedBefore !== undefined && !!Number.isNaN(uploadedBefore)) {
			throw new InternalError().context("uploadedBefore must be a number.");
		}
		if (uploadedAfter !== undefined && !!Number.isNaN(uploadedBefore)) {
			throw new InternalError().context("uploadedAfter must be a number.");
		}
		return this;
	}

	getOptions(options: R2GetOptions): Validator {
		const { onlyIf = {}, range = {} } = options;

		this.onlyIf(onlyIf);

		if (typeof range !== "object") {
			throw new InternalError().context(
				"range must either be an object or undefined."
			);
		}
		const { offset, length, suffix } = range;

		if (offset !== undefined) {
			if (typeof offset !== "number" || Number.isNaN(offset)) {
				throw new InternalError().context(
					"offset must either be a number or undefined."
				);
			}
			if (offset < 0) {
				throw new InternalError().context(
					"Invalid range. Starting offset must be greater than or equal to 0."
				);
			}
		}
		if (
			(length !== undefined && typeof length !== "number") ||
			Number.isNaN(length)
		) {
			throw new InternalError().context(
				"length must either be a number or undefined."
			);
		}
		if (
			(suffix !== undefined && typeof suffix !== "number") ||
			Number.isNaN(suffix)
		) {
			throw new InternalError().context(
				"suffix must either be a number or undefined."
			);
		}
		return this;
	}

	httpMetadata(httpMetadata?: R2HTTPMetadata): Validator {
		if (httpMetadata === undefined) return this;
		if (typeof httpMetadata !== "object") {
			throw new InternalError().context(
				"httpMetadata must be an object or undefined."
			);
		}
		for (const [key, value] of Object.entries(httpMetadata)) {
			if (typeof value !== "string" && value !== undefined) {
				throw new InvalidObjectName().context(
					`${key}'s value must be a string or undefined.`
				);
			}
		}
		return this;
	}

	putOptions(options: R2PutOptions): Validator {
		const { httpMetadata, customMetadata, md5 } = options;

		this.httpMetadata(httpMetadata);

		if (customMetadata !== undefined) {
			if (typeof customMetadata !== "object") {
				throw new InternalError().context(
					"customMetadata must be an object or undefined."
				);
			}
			for (const v of Object.values(customMetadata)) {
				if (typeof v !== "string") {
					throw new InternalError().context(
						"customMetadata values must be strings."
					);
				}
			}
		}

		if (md5 !== undefined && typeof md5 !== "string") {
			throw new InvalidDigest().context("md5 must be a string or undefined.");
		}
		return this;
	}

	listOptions(options: R2ListOptions): Validator {
		const { limit, prefix, cursor, delimiter, include } = options;

		if (limit !== undefined) {
			if (typeof limit !== "number") {
				throw new InternalError().context(
					"limit must be a number or undefined."
				);
			}
			if (limit < 1 || limit > MAX_LIST_KEYS) {
				throw new InvalidMaxKeys();
			}
		}
		if (prefix !== undefined && typeof prefix !== "string") {
			throw new InternalError().context(
				"prefix must be a string or undefined."
			);
		}
		if (cursor !== undefined && typeof cursor !== "string") {
			throw new InternalError().context(
				"cursor must be a string or undefined."
			);
		}
		if (delimiter !== undefined && typeof delimiter !== "string") {
			throw new InternalError().context(
				"delimiter must be a string or undefined."
			);
		}

		if (include !== undefined) {
			if (!Array.isArray(include)) {
				throw new InternalError().context(
					"include must be an array or undefined."
				);
			}
			for (const value of include) {
				if (value !== "httpMetadata" && value !== "customMetadata") {
					throw new InternalError().context(
						"include values must be httpMetadata and/or customMetadata strings."
					);
				}
			}
		}
		return this;
	}
}
