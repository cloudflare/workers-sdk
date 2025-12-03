declare module "stream/web" {
	interface ReadableStreamBYOBRequest {
		readonly view: ArrayBufferView | null;
		respond(bytesWritten: number): void;
		respondWithNewView(view: ArrayBufferView): void;
	}

	interface ReadableStream<R = any> {
		getReader(): ReadableStreamDefaultReader<R>;
		getReader(options: { mode: "byob" }): ReadableStreamBYOBReader;
	}

	interface ReadableStreamBYOBReader {
		readonly closed: Promise<undefined>;
		cancel(reason?: any): Promise<void>;
		read<T extends ArrayBufferView>(
			view: T
		): Promise<ReadableStreamDefaultReader<T>>;
		releaseLock(): void;
	}
}

declare module "stream/consumers" {
	import { Blob } from "node:buffer";
	import { Readable } from "node:stream";

	// `@types/node`'s types for `stream/consumers` omit `AsyncIterable<any>`,
	// meaning passing `ReadableStream`s from `stream/web` fails
	type StreamLike =
		| NodeJS.ReadableStream
		| Readable
		| AsyncIterator<any>
		| AsyncIterable<any>;

	function buffer(stream: StreamLike): Promise<Buffer>;
	function text(stream: StreamLike): Promise<string>;
	function arrayBuffer(stream: StreamLike): Promise<ArrayBuffer>;
	function blob(stream: StreamLike): Promise<Blob>;
	function json(stream: StreamLike): Promise<unknown>;
}
