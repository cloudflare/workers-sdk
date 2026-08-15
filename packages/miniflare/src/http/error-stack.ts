import zlib from "node:zlib";
import { decodeErrorPayload } from "../workers/core/constants";

/**
 * Gzip magic number (`1f 8b`). Used instead of the `Content-Encoding` header:
 * undici's `fetch` decompresses the body but leaves that header in place, so
 * trusting the header would gunzip already-plain JSON.
 */
function isGzip(bytes: Uint8Array): boolean {
	return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * workerd may gzip a body the Worker already compressed, so inflate until the magic is gone.
 */
function gunzipNested(bytes: Uint8Array): Buffer {
	let decoded = Buffer.from(bytes);
	while (isGzip(decoded)) {
		const next = zlib.gunzipSync(decoded);
		if (next.equals(decoded)) {
			break;
		}
		decoded = next;
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
	if (bytes.byteLength === 0) {
		return decodeErrorPayload(response);
	}

	let decoded: Buffer;
	try {
		decoded = gunzipNested(bytes);
	} catch {
		return decodeErrorPayload(response);
	}

	const serialised = decoded.toString("utf8");
	return serialised === "" ? decodeErrorPayload(response) : serialised;
}
