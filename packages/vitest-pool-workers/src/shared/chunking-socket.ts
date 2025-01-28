import assert from "node:assert";
import { Buffer } from "node:buffer";

export interface SocketLike<Message extends ArrayBuffer | Uint8Array | string> {
	post(message: Message): void;
	on(listener: (message: Message) => void): void;
}

/**
 * Wraps a binary/string socket to produce a chunked-string socket. If a string
 * exceeds the maximum size for a message, it is split into binary chunks
 * followed by an empty string. If not, it is sent directly as a string.
 * This assumes in-order delivery of chunks.
 */
export function createChunkingSocket(
	socket: SocketLike<ArrayBuffer | Uint8Array<ArrayBuffer> | string>,
	maxChunkByteLength = 1_048_576 /* 1 MiB */
): SocketLike<string> {
	const listeners: ((message: string) => void)[] = [];

	const decoder = new TextDecoder();
	let chunks: string | undefined;
	socket.on((message) => {
		if (typeof message === "string") {
			if (chunks !== undefined) {
				// If we've been collecting chunks, this must be the end-of-chunks
				// marker, so use all chunks as the message instead
				assert.strictEqual(message, "", "Expected end-of-chunks");
				message = chunks + decoder.decode();
				chunks = undefined;
			}
			for (const listener of listeners) {
				listener(message);
			}
		} else {
			// If this isn't a `string` message, it must be a chunk
			chunks ??= "";
			chunks += decoder.decode(message, { stream: true });
		}
	});

	return {
		post(value) {
			if (Buffer.byteLength(value) > maxChunkByteLength) {
				// If the message is greater than the size limit, chunk it
				const encoded = Buffer.from(value);
				for (let i = 0; i < encoded.byteLength; i += maxChunkByteLength) {
					socket.post(encoded.subarray(i, i + maxChunkByteLength));
				}
				socket.post("");
			} else {
				// Otherwise, just send it as a string
				socket.post(value);
			}
		},
		on(listener) {
			listeners.push(listener);
		},
	};
}
