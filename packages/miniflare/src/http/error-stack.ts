import zlib from "node:zlib";
import { decodeErrorPayload } from "../workers/core/constants";

/**
 * Ceiling for gzip and brotli inflate of an ERROR_STACK body. Plain JSON is
 * decoded as-is; this bound exists to stop a compression bomb, not to drop a
 * large stack.
 */
export const MAX_ERROR_STACK_BYTES = 1024 * 1024;

/**
 * workerd can wrap a body the Worker already gzipped, so a couple of inflates
 * are expected. Anything past this is treated as a bomb, not an error page.
 */
export const MAX_GZIP_ROUNDS = 4;

/**
 * Gzip magic number (`1f 8b`). Used instead of the `Content-Encoding` header:
 * undici's `fetch` decompresses the body but leaves that header in place, so
 * trusting the header would gunzip already-plain JSON.
 */
export function isGzip(bytes: Uint8Array): boolean {
	return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * workerd may gzip a body the Worker already compressed, so inflate until the
 * magic is gone, a round or size cap is hit, or inflate throws.
 */
function gunzipNested(bytes: Uint8Array): Buffer {
	let decoded: Buffer = Buffer.from(bytes);
	for (let round = 0; isGzip(decoded) && round < MAX_GZIP_ROUNDS; round++) {
		const next = zlib.gunzipSync(decoded, {
			maxOutputLength: MAX_ERROR_STACK_BYTES,
		});
		if (next.equals(decoded)) {
			break;
		}
		decoded = Buffer.from(next);
	}
	return decoded;
}

/**
 * Returns serialised JSON, or the payload header when the body is empty or is
 * not JSON (oversized brotli that skipped inflate, leftover compressed bytes).
 */
function jsonOrPayload(
	text: string,
	response: { headers: { get(name: string): string | null } }
): string | null {
	if (text === "") {
		return decodeErrorPayload(response);
	}
	try {
		JSON.parse(text);
		return text;
	} catch {
		return decodeErrorPayload(response);
	}
}

/**
 * Brotli has no reliable magic number. Attempt inflate and treat a throw as
 * "this was not brotli", so leftover `Content-Encoding: br` on already-plain
 * JSON is left alone. An inflate that exceeds the size cap is a bomb, not a
 * miss. Oversized input returns null rather than "bomb" so a large plain JSON
 * stack still utf8-decodes; compressed bytes that are not JSON then fall
 * through to `jsonOrPayload`.
 */
function tryBrotli(bytes: Uint8Array): Buffer | "bomb" | null {
	if (bytes.byteLength > MAX_ERROR_STACK_BYTES) {
		return null;
	}
	try {
		return zlib.brotliDecompressSync(bytes, {
			maxOutputLength: MAX_ERROR_STACK_BYTES,
		});
	} catch (error) {
		if (
			error instanceof RangeError ||
			(error instanceof Error &&
				"code" in error &&
				error.code === "ERR_BUFFER_TOO_LARGE")
		) {
			return "bomb";
		}
		return null;
	}
}

/**
 * Reads the serialised Worker error from an ERROR_STACK 500.
 *
 * `workerd` drops bodies on `HEAD` (empty → payload header). WebSocket
 * upgrades that fail go through `ws` `unexpected-response`, which does not
 * decompress, so a gzipped or brotli body must be inflated before `JSON.parse`.
 */
export async function readErrorStackBody(response: {
	arrayBuffer(): Promise<ArrayBuffer>;
	headers: { get(name: string): string | null };
}): Promise<string | null> {
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength === 0) {
		return decodeErrorPayload(response);
	}

	if (isGzip(bytes)) {
		if (bytes.byteLength > MAX_ERROR_STACK_BYTES) {
			return decodeErrorPayload(response);
		}

		let decoded: Buffer;
		try {
			decoded = gunzipNested(bytes);
		} catch {
			return decodeErrorPayload(response);
		}

		if (isGzip(decoded)) {
			return decodeErrorPayload(response);
		}

		const serialised = decoded.toString("utf8");
		return jsonOrPayload(serialised, response);
	}

	const brotli = tryBrotli(bytes);
	if (brotli === "bomb") {
		return decodeErrorPayload(response);
	}
	if (brotli !== null) {
		const serialised = brotli.toString("utf8");
		if (serialised !== "") {
			return jsonOrPayload(serialised, response);
		}
	}

	return jsonOrPayload(Buffer.from(bytes).toString("utf8"), response);
}
