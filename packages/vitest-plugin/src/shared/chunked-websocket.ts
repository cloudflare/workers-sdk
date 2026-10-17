const CHUNK_FRAME_PREFIX = "__VITEST_POOL_WORKERS_CHUNK__:";
// 64 Ki UTF-16 code units keep the JSON-wrapped WebSocket frame comfortably
// below workerd's 1 MiB limit, even when every character needs JSON escaping.
const CHUNK_SIZE = 64 * 1024;

let nextMessageId = 0;

interface MessageChunk {
	id: number;
	index: number;
	total: number;
	data: string;
}

interface PartialMessage {
	total: number;
	chunks: Map<number, string>;
}

/**
 * Sends a serialized message directly when small, or in bounded frames when
 * necessary. The receiver must use `createChunkedWebSocketMessageHandler()`.
 *
 * @param send - Callback that sends a single WebSocket text frame.
 * @param message - The complete serialized message.
 */
export function sendChunkedWebSocketMessage(
	send: (frame: string) => void,
	message: string
): void {
	if (message.length <= CHUNK_SIZE) {
		send(message);
		return;
	}

	const id = nextMessageId++;
	const total = Math.ceil(message.length / CHUNK_SIZE);
	for (let index = 0; index < total; index++) {
		const data = message.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
		const chunk: MessageChunk = { id, index, total, data };
		send(`${CHUNK_FRAME_PREFIX}${JSON.stringify(chunk)}`);
	}
}

/**
 * Creates a receiver that reassembles chunk frames before passing complete
 * serialized messages to the RPC parser.
 *
 * @param onMessage - Called once for each complete serialized message.
 * @returns A handler for WebSocket text frames.
 */
export function createChunkedWebSocketMessageHandler(
	onMessage: (message: string) => void
): (frame: string) => void {
	const partialMessages = new Map<number, PartialMessage>();

	return (frame) => {
		if (!frame.startsWith(CHUNK_FRAME_PREFIX)) {
			onMessage(frame);
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(frame.slice(CHUNK_FRAME_PREFIX.length));
		} catch {
			throw new Error("Received a malformed Vitest pool WebSocket chunk");
		}
		if (typeof parsed !== "object" || parsed === null) {
			throw new Error("Received a malformed Vitest pool WebSocket chunk");
		}

		const chunk = parsed as Record<string, unknown>;
		const { id, index, total, data } = chunk;
		if (
			typeof id !== "number" ||
			!Number.isSafeInteger(id) ||
			typeof index !== "number" ||
			!Number.isSafeInteger(index) ||
			typeof total !== "number" ||
			!Number.isSafeInteger(total) ||
			total < 1 ||
			index < 0 ||
			index >= total ||
			typeof data !== "string"
		) {
			throw new Error("Received a malformed Vitest pool WebSocket chunk");
		}

		let partial = partialMessages.get(id);
		if (partial === undefined) {
			partial = { total, chunks: new Map() };
			partialMessages.set(id, partial);
		} else if (partial.total !== total) {
			throw new Error("Received inconsistent Vitest pool WebSocket chunks");
		}
		partial.chunks.set(index, data);
		if (partial.chunks.size !== total) return;

		partialMessages.delete(id);
		let message = "";
		for (let chunkIndex = 0; chunkIndex < total; chunkIndex++) {
			const part = partial.chunks.get(chunkIndex);
			if (part === undefined) {
				throw new Error("Received incomplete Vitest pool WebSocket chunks");
			}
			message += part;
		}
		onMessage(message);
	};
}
