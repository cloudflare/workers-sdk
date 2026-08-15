import zlib from "node:zlib";
import { decodeErrorPayload } from "../workers/core/constants";

/**
 * Ceiling for an ERROR_STACK body, compressed or inflated. These payloads are
 * a serialised Worker exception, not an application response.
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
function isGzip(bytes: Uint8Array): boolean {
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
 * Reads the serialised Worker error from an ERROR_STACK 500.
 *
 * `workerd` drops bodies on `HEAD` (empty → payload header). WebSocket
 * upgrades that fail go through `ws` `unexpected-response`, which does not
 * decompress, so a gzipped body must be inflated before `JSON.parse`.
 */
export async function readErrorStackBody(response: {
	arrayBuffer(): Promise<ArrayBuffer>;
	headers: { get(name: string): string | null };
}): Promise<string | null> {
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_ERROR_STACK_BYTES) {
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
	return serialised === "" ? decodeErrorPayload(response) : serialised;
}
