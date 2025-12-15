declare module "node:stream/consumers" {
	import type { Blob } from "node:buffer";
	import type { Readable } from "node:stream";

	// `@types/node`'s types for `stream/consumers` omit `AsyncIterable<any>`,
	// meaning passing `ReadableStream`s from `stream/web` fails
	type StreamLike =
		| NodeJS.ReadableStream
		| Readable
		| AsyncIterator<unknown>
		| AsyncIterable<unknown>;

	function buffer(stream: StreamLike): Promise<Buffer>;
	function text(stream: StreamLike): Promise<string>;
	function arrayBuffer(stream: StreamLike): Promise<ArrayBuffer>;
	function blob(stream: StreamLike): Promise<Blob>;
	function json(stream: StreamLike): Promise<unknown>;
}
