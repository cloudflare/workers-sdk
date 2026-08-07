// Helpers for preparing email bytes for capture into the local email store.
//
// Capture is a dev-only inspection aid for the Local Explorer. It pushes the
// raw MIME (as base64) to the EmailStore Durable Object over workerd-internal
// RPC, whose argument size is capped near 1 MiB. Rather than fail delivery for
// larger messages, oversized bodies are truncated for capture only; delivery
// always uses the full, untruncated message.

export const RAW_EMAIL = "EmailMessage::raw";

/**
 * Maximum raw byte size of an email body captured into the local email store.
 *
 * This is a capture/inspection limit, not a delivery limit: sending, replying,
 * and receiving always use the full message regardless of size. Capture pushes
 * the raw MIME to the EmailStore Durable Object over workerd-internal RPC,
 * whose argument size is capped near 1 MiB, so larger bodies are truncated to
 * this size for the Local Explorer (see `truncateRawForCapture`).
 */
export const MAX_LOCAL_EMAIL_BYTES = 1024 * 1024;

/** Encodes bytes without passing a large argument list to String.fromCharCode. */
export function bytesToBase64(bytes: Uint8Array): string {
	const chunkSize = 0x8000;
	let binary = "";
	for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + chunkSize)
		);
	}
	return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export interface TruncatedRaw {
	/** Raw MIME content, truncated to `MAX_LOCAL_EMAIL_BYTES` when oversized. */
	raw: string;
	/** Lossless base64 of the (possibly truncated) raw content. */
	rawBase64: string;
	/** Whether the content was truncated for capture. */
	truncated: boolean;
}

/**
 * Prepares a raw email body for capture in the local email store.
 *
 * Capture pushes the raw MIME (as base64) to the EmailStore Durable Object over
 * workerd-internal RPC, whose argument size is capped near 1 MiB. Rather than
 * fail delivery for larger messages, we capture only the first
 * `MAX_LOCAL_EMAIL_BYTES` of the raw body so the Local Explorer still shows a
 * (truncated) message. Delivery itself always uses the full, untruncated body —
 * this only affects what the inspector stores.
 */
export function truncateRawForCapture(raw: Uint8Array): TruncatedRaw {
	const truncated = raw.byteLength > MAX_LOCAL_EMAIL_BYTES;
	const captured = truncated ? raw.subarray(0, MAX_LOCAL_EMAIL_BYTES) : raw;
	return {
		raw: new TextDecoder().decode(captured),
		rawBase64: bytesToBase64(captured),
		truncated,
	};
}

/**
 * Truncates a UTF-8 string to at most `maxBytes` bytes, splitting on a byte
 * boundary (any trailing partial multi-byte sequence is dropped by the decoder).
 * Returns the original string when it already fits.
 */
export function truncateStringForCapture(
	value: string,
	maxBytes: number = MAX_LOCAL_EMAIL_BYTES
): { value: string; truncated: boolean } {
	const bytes = new TextEncoder().encode(value);
	if (bytes.byteLength <= maxBytes) {
		return { value, truncated: false };
	}
	return {
		value: new TextDecoder().decode(bytes.subarray(0, maxBytes)),
		truncated: true,
	};
}
