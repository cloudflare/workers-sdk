// workerd limits WebSocket messages to 32 MiB. Leave room for envelopes:
// https://github.com/cloudflare/workers-sdk/issues/16515
export const MAX_WS_FRAME_BYTES = 16 * 1024 * 1024;

const CHUNK_PREFIX = '{"__vpwWsChunk":1,';
const encoder = new TextEncoder();
let nextId = 0;

function protocolError(): Error {
	return new Error(
		"Invalid Vitest WebSocket chunk. Warm-module snapshots must be chunked to respect workerd's 32 MiB WebSocket message limit (workers-sdk issue #16515)."
	);
}

/** Send serialized messages unchanged when small, or as ordered chunk envelopes. */
export function sendChunked(
	send: (data: string) => void,
	serialized: string
): void {
	if (encoder.encode(serialized).byteLength <= MAX_WS_FRAME_BYTES) {
		send(serialized);
		return;
	}

	// JSON can expand each UTF-16 code unit to six bytes (e.g. \u0000 or
	// a lone surrogate). Reserve envelope space as well, so even escaped or
	// non-ASCII source stays within the byte budget after JSON.stringify().
	const chunkLength = Math.floor((MAX_WS_FRAME_BYTES - 1024) / 6);
	const total = Math.ceil(serialized.length / chunkLength);
	const id = String(nextId++);
	for (let index = 0; index < total; index++) {
		const raw = JSON.stringify({
			__vpwWsChunk: 1,
			id,
			index,
			total,
			data: serialized.slice(index * chunkLength, (index + 1) * chunkLength),
		});
		if (encoder.encode(raw).byteLength > MAX_WS_FRAME_BYTES) {
			throw protocolError();
		}
		send(raw);
	}
}

/** Reassemble ordered chunks per logical message before deserializing it. */
export function createChunkReassembler(
	onComplete: (serialized: string) => void
): (raw: string) => void {
	const pending = new Map<string, { total: number; chunks: string[] }>();
	return (raw) => {
		// Structured-serializable Vitest messages use devalue's array format,
		// so this reserved object prefix cannot collide with RPC messages.
		if (!raw.startsWith(CHUNK_PREFIX)) {
			onComplete(raw);
			return;
		}
		const chunk = JSON.parse(raw) as {
			id: string;
			index: number;
			total: number;
			data: string;
		};
		if (
			typeof chunk.id !== "string" ||
			!Number.isSafeInteger(chunk.index) ||
			!Number.isSafeInteger(chunk.total) ||
			chunk.total < 1 ||
			typeof chunk.data !== "string" ||
			encoder.encode(raw).byteLength > MAX_WS_FRAME_BYTES
		) {
			pending.delete(chunk.id);
			throw protocolError();
		}
		const message = pending.get(chunk.id) ?? { total: chunk.total, chunks: [] };
		if (
			chunk.total !== message.total ||
			chunk.index !== message.chunks.length ||
			chunk.index >= chunk.total
		) {
			pending.delete(chunk.id);
			throw protocolError();
		}
		message.chunks.push(chunk.data);
		if (message.chunks.length === message.total) {
			pending.delete(chunk.id);
			onComplete(message.chunks.join(""));
		} else {
			pending.set(chunk.id, message);
		}
	};
}
