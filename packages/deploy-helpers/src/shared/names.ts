import { createHash } from "node:crypto";

const SHORT_HASH_LENGTH = 7;

/**
 * Fits `body` and `suffix` into `maxLength` by truncating the body, so a
 * suffix that distinguishes one name from another always survives.
 *
 * A suffix longer than `maxLength` leaves no body at all, so callers that
 * cannot guarantee room should check before calling.
 */
export function truncateWithSuffix(
	body: string,
	suffix: string,
	maxLength: number
): string {
	const maxBodyLength = Math.max(0, maxLength - suffix.length);
	return `${body.slice(0, maxBodyLength)}${suffix}`;
}

/**
 * A short digest of `input`, 32 bits in base36, for telling apart strings that
 * a lossy transform maps onto one output. Not a security boundary.
 */
export function shortHash(input: string): string {
	return createHash("sha256")
		.update(input)
		.digest()
		.readUInt32BE(0)
		.toString(36)
		.padStart(SHORT_HASH_LENGTH, "0");
}
