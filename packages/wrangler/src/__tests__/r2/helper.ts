import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

/**
 * Creates a big file without having to allocate it in memory first.
 *
 * @param name The name of the file to create
 * @param minSizeByte The minimum size of the file in bytes
 */
export async function createBigFile(
	name: string,
	minSizeByte: number
): Promise<void> {
	const CHUNK_SIZE = 64 * 1024;
	// Pre-allocate a reusable buffer to avoid garbage collection overhead
	const chunk = Buffer.alloc(CHUNK_SIZE, "x");

	// Generator function that yields chunks until the size is met
	const dataStream = async function* (): AsyncGenerator<Buffer, void, unknown> {
		let currentSize = 0;
		while (currentSize < minSizeByte) {
			yield chunk;
			currentSize += CHUNK_SIZE;
		}
	};

	// pipeline handles the backpressure automatically
	await pipeline(dataStream(), createWriteStream(name));
}
