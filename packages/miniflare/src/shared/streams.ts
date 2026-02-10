import { ReadableStream, TransformStream } from "node:stream/web";

export function prefixStream(
	prefix: Uint8Array,
	stream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
	const identity = new TransformStream<Uint8Array, Uint8Array>();
	const writer = identity.writable.getWriter();
	// The promise returned by `writer.write()` will only resolve once the chunk
	// is read, which won't be until after this function returns, so we can't
	// use `await` here
	void writer
		.write(prefix)
		.then(() => {
			// Release the writer without closing the stream
			writer.releaseLock();
			return stream.pipeTo(identity.writable);
		})
		.catch((error) => {
			return writer.abort(error);
		});
	return identity.readable;
}

export async function readPrefix(
	stream: ReadableStream<Uint8Array>,
	prefixLength: number
): Promise<[prefix: Buffer, rest: ReadableStream<Uint8Array>]> {
	// NOTE: we can't use a `TransformStream` and buffer the first N chunks as we
	// need this metadata to determine what to do with the rest of the body. We
	// have to *pull* the data as opposed to passively transforming it as it's
	// piped somewhere else. If `body` were a byte stream, we could use BYOB reads
	// to read just enough. Even better, if this were running in the Workers
	// runtime, we could use `readAtLeast()` to read everything at once.
	const chunks: Uint8Array[] = [];
	let chunksLength = 0;
	for await (const chunk of stream.values({ preventCancel: true })) {
		chunks.push(chunk);
		chunksLength += chunk.byteLength;
		// Once we've read enough bytes, stop
		if (chunksLength >= prefixLength) break;
	}
	// If we read the entire stream without enough bytes for prefix, throw
	if (chunksLength < prefixLength) {
		throw new RangeError(
			`Expected ${prefixLength} byte prefix, but received ${chunksLength} byte stream`
		);
	}
	const atLeastPrefix = Buffer.concat(chunks, chunksLength);
	const prefix = atLeastPrefix.subarray(0, prefixLength);

	let rest = stream;
	// If we read over when reading prefix (quite likely), create a new stream,
	// write the bit we read, then write the rest of the stream
	if (chunksLength > prefixLength) {
		rest = prefixStream(atLeastPrefix.subarray(prefixLength), stream);
	}

	return [prefix, rest];
}
