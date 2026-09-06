// Helpers for fitting captured email records into the local email store.
//
// Capture is a dev-only inspection aid for the Local Explorer. SQLite-backed
// Durable Objects limit each row and string value to 2 MB, so metadata is
// preserved first and body content is truncated to fit the remaining space.
// Delivery always uses the full, untruncated message.

export const RAW_EMAIL = "EmailMessage::raw";

/**
 * Maximum size of an email-store SQLite row or string value.
 */
export const MAX_EMAIL_ROW_BYTES = 2_000_000;

/**
 * Maximum raw byte size of an email message, matching production behaviour so
 * oversized messages fail the same way locally.
 */
export const MAX_PRODUCTION_EMAIL_BYTES = 25 * 1024 * 1024;

/**
 * Reserve a small amount for SQLite's record header and the non-JSON columns
 * (`kind`, `id`, and `created_at`). The remaining bytes are available to the
 * serialized JSON value stored in `emails.data`, or to a body-table value.
 */
export const MAX_EMAIL_ROW_VALUE_BYTES = MAX_EMAIL_ROW_BYTES - 1024;
export const MAX_EMAIL_BODY_BYTES =
	Math.floor(MAX_EMAIL_ROW_VALUE_BYTES / 4) * 3;

const encoder = new TextEncoder();

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

export function jsonByteLength(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

/**
 * Removes top-level MIME headers from a captured copy without decoding or
 * re-encoding the body. Delivery can continue using the original bytes.
 */
export function stripEmailHeader(
	raw: Uint8Array,
	headerName: string
): Uint8Array {
	const removals: Array<{ start: number; end: number }> = [];
	let offset = 0;
	let headerStart = 0;
	let removeHeader = false;

	while (offset < raw.byteLength) {
		const line = findHeaderLine(raw, offset);
		if (line.contentEnd === offset) {
			if (removeHeader) {
				removals.push({ start: headerStart, end: offset });
				removeHeader = false;
			}
			break;
		}

		const continuation = raw[offset] === 0x20 || raw[offset] === 0x09;
		if (!continuation) {
			if (removeHeader) {
				removals.push({ start: headerStart, end: offset });
			}
			headerStart = offset;
			removeHeader = headerNameMatches(
				raw,
				offset,
				line.contentEnd,
				headerName
			);
		}
		offset = line.end;
	}
	if (removeHeader) {
		removals.push({ start: headerStart, end: offset });
	}

	if (removals.length === 0) {
		return raw;
	}

	const removedBytes = removals.reduce(
		(total, removal) => total + removal.end - removal.start,
		0
	);
	const stripped = new Uint8Array(raw.byteLength - removedBytes);
	let sourceOffset = 0;
	let targetOffset = 0;
	for (const removal of removals) {
		const retained = raw.subarray(sourceOffset, removal.start);
		stripped.set(retained, targetOffset);
		targetOffset += retained.byteLength;
		sourceOffset = removal.end;
	}
	stripped.set(raw.subarray(sourceOffset), targetOffset);
	return stripped;
}

export interface CapturedRaw {
	/** Lossless base64 of the captured raw MIME prefix. */
	rawBase64: string;
	/** Whether the content was truncated for capture. */
	truncated: boolean;
}

/**
 * Captures the largest raw MIME prefix whose Base64 representation fits in a
 * body-table value.
 */
export function captureRawForBodyRow(raw: Uint8Array): CapturedRaw {
	return captureRawForBase64Budget(raw, MAX_EMAIL_ROW_VALUE_BYTES);
}

/**
 * Captures the largest raw MIME prefix that fits beside the supplied metadata
 * in a JSON email row.
 */
export function captureRawForJsonRow<T extends object>(
	metadata: T,
	raw: Uint8Array,
	includeTruncationMarker = false
): {
	email: T & { rawBase64?: string; captureTruncated?: boolean };
	truncated: boolean;
} {
	assertMetadataFits(metadata);
	const initial = captureRawForJsonRowMetadata(metadata, raw);
	if (!initial.truncated || !includeTruncationMarker) {
		return initial;
	}
	return captureRawForJsonRowMetadata(
		{ ...metadata, captureTruncated: true },
		raw
	);
}

function captureRawForJsonRowMetadata<T extends object>(
	metadata: T,
	raw: Uint8Array
): { email: T & { rawBase64?: string }; truncated: boolean } {
	assertMetadataFits(metadata);
	const emptyRecord = { ...metadata, rawBase64: "" };
	const emptyRecordBytes = jsonByteLength(emptyRecord);
	if (emptyRecordBytes > MAX_EMAIL_ROW_VALUE_BYTES) {
		return {
			email: { ...metadata },
			truncated: raw.byteLength > 0,
		};
	}
	const availableBase64Bytes = MAX_EMAIL_ROW_VALUE_BYTES - emptyRecordBytes;
	const captured = captureRawForBase64Budget(raw, availableBase64Bytes);
	return {
		email: { ...metadata, rawBase64: captured.rawBase64 },
		truncated: captured.truncated,
	};
}

/**
 * Fits MessageBuilder body fields into a JSON email row. Each field is added
 * only if its empty representation fits, so `text` receives priority and
 * `html` consumes only the remaining bytes.
 */
export function captureTextAndHtmlForJsonRow<T extends object>(
	metadata: T,
	text: string | undefined,
	html: string | undefined,
	includeTruncationMarker = false
): {
	email: T & {
		text?: string;
		html?: string;
		captureTruncated?: boolean;
	};
	truncated: boolean;
} {
	const initial = captureTextAndHtmlForJsonRowMetadata(metadata, text, html);
	if (!initial.truncated || !includeTruncationMarker) {
		return initial;
	}
	return captureTextAndHtmlForJsonRowMetadata(
		{ ...metadata, captureTruncated: true },
		text,
		html
	);
}

function captureTextAndHtmlForJsonRowMetadata<T extends object>(
	metadata: T,
	text: string | undefined,
	html: string | undefined
): {
	email: T & { text?: string; html?: string };
	truncated: boolean;
} {
	assertMetadataFits(metadata);
	let email: T & { text?: string; html?: string } = { ...metadata };

	let truncated = false;
	if (text !== undefined) {
		const captured = captureOptionalStringField(email, "text", text);
		email = captured.email;
		truncated ||= captured.truncated;
	}
	if (html !== undefined) {
		const captured = captureOptionalStringField(email, "html", html);
		email = captured.email;
		truncated ||= captured.truncated;
	}
	return { email, truncated };
}

function assertMetadataFits(metadata: object): void {
	if (jsonByteLength(metadata) > MAX_EMAIL_ROW_VALUE_BYTES) {
		throw new RangeError("Email metadata exceeds the 2 MB storage row limit");
	}
}

function captureRawForBase64Budget(
	raw: Uint8Array,
	maxBase64Bytes: number
): CapturedRaw {
	const maxEncodedGroups = Math.max(0, Math.floor(maxBase64Bytes / 4));
	const maxRawBytes = maxEncodedGroups * 3;
	const truncated = raw.byteLength > maxRawBytes;
	const captured = truncated ? raw.subarray(0, maxRawBytes) : raw;
	return { rawBase64: bytesToBase64(captured), truncated };
}

function captureOptionalStringField<
	T extends object,
	K extends "text" | "html",
>(
	email: T & { text?: string; html?: string },
	field: K,
	value: string
): {
	email: T & { text?: string; html?: string };
	truncated: boolean;
} {
	const emptyEmail = { ...email, [field]: "" };
	if (jsonByteLength(emptyEmail) > MAX_EMAIL_ROW_VALUE_BYTES) {
		return { email, truncated: value.length > 0 };
	}
	return captureStringField(emptyEmail, field, value);
}

function captureStringField<T extends object, K extends "text" | "html">(
	email: T & { text?: string; html?: string },
	field: K,
	value: string
): {
	email: T & { text?: string; html?: string };
	truncated: boolean;
} {
	const fullEmail = { ...email, [field]: value };
	if (jsonByteLength(fullEmail) <= MAX_EMAIL_ROW_VALUE_BYTES) {
		return { email: fullEmail, truncated: false };
	}

	let lower = 0;
	let upper = value.length;
	while (lower < upper) {
		const middle = Math.ceil((lower + upper) / 2);
		const candidate = safeStringPrefix(value, middle);
		const candidateEmail = { ...email, [field]: candidate };
		if (jsonByteLength(candidateEmail) <= MAX_EMAIL_ROW_VALUE_BYTES) {
			lower = middle;
		} else {
			upper = middle - 1;
		}
	}
	return {
		email: { ...email, [field]: safeStringPrefix(value, lower) },
		truncated: true,
	};
}

function safeStringPrefix(value: string, length: number): string {
	let end = Math.min(length, value.length);
	if (
		end > 0 &&
		end < value.length &&
		value.charCodeAt(end - 1) >= 0xd800 &&
		value.charCodeAt(end - 1) <= 0xdbff &&
		value.charCodeAt(end) >= 0xdc00 &&
		value.charCodeAt(end) <= 0xdfff
	) {
		end--;
	}
	return value.slice(0, end);
}

function findHeaderLine(
	raw: Uint8Array,
	start: number
): { contentEnd: number; end: number } {
	for (let index = start; index < raw.byteLength; index++) {
		if (raw[index] !== 0x0a) {
			continue;
		}
		const contentEnd =
			index > start && raw[index - 1] === 0x0d ? index - 1 : index;
		return { contentEnd, end: index + 1 };
	}
	return { contentEnd: raw.byteLength, end: raw.byteLength };
}

function headerNameMatches(
	raw: Uint8Array,
	start: number,
	end: number,
	headerName: string
): boolean {
	let colon = start;
	while (colon < end && raw[colon] !== 0x3a) {
		colon++;
	}
	if (colon === end || colon - start !== headerName.length) {
		return false;
	}
	for (let index = 0; index < headerName.length; index++) {
		const byte = raw[start + index];
		const lowerByte = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
		const expected = headerName.charCodeAt(index);
		const lowerExpected =
			expected >= 0x41 && expected <= 0x5a ? expected + 0x20 : expected;
		if (lowerByte !== lowerExpected) {
			return false;
		}
	}
	return true;
}
