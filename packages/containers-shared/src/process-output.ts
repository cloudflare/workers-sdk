const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const DOCKER_DEBUG_HINT =
	"Set WRANGLER_LOG=debug to stream complete Docker output.";

/** Keep the most recent subprocess output without allowing logs to grow unbounded. */
export function createBoundedOutputCollector(
	maxBytes = DEFAULT_MAX_OUTPUT_BYTES
) {
	let output: Buffer = Buffer.alloc(0);

	return {
		append(chunk: unknown) {
			const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
			if (next.byteLength >= maxBytes) {
				output = next.subarray(next.byteLength - maxBytes);
				return;
			}

			const retainedBytes = Math.min(
				output.byteLength,
				maxBytes - next.byteLength
			);
			output = Buffer.concat([
				output.subarray(output.byteLength - retainedBytes),
				next,
			]);
		},
		read() {
			return output.toString("utf8").trim();
		},
	};
}

export function withDockerDebugHint(message: string): string {
	return message.includes(DOCKER_DEBUG_HINT)
		? message
		: `${message}\n\n${DOCKER_DEBUG_HINT}`;
}
