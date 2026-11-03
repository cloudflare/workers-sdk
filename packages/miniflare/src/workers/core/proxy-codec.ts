import { RpcStub } from "capnweb";

// This file implements the value codec shared by Miniflare's Node.js API proxy
// client and the `ProxyServer` Durable Object. Both sides encode values before
// sending them over Cap'n Web, and decode values they receive, so values Cap'n
// Web can't send itself keep the fidelity they'd have with Workers RPC.

/** Key marking a plain object as a value encoded by {@link ProxyCodec}. */
export const PROXY_ENCODED_KEY = "$miniflare";

/** Value encoded by {@link ProxyCodec}, identified by its type. */
export interface ProxyEncoded {
	[PROXY_ENCODED_KEY]: string;
	value: unknown;
	/** Cap'n Web stub for methods of objects returned with their data */
	stub?: unknown;
}

// Cap'n Web only revives the names of built-in errors. Other names are sent in
// this property, then restored by the receiver.
const ERROR_NAME_KEY = "__miniflareErrorName";
// Errors Cap'n Web revives with their original class, and therefore name
const BUILT_IN_ERROR_NAMES = new Set([
	"Error",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"AggregateError",
]);

// `workerd` closes WebSockets receiving messages over 32 MiB, ending the
// session and breaking every stub. Strings and bytes larger than
// `STREAMED_VALUE_THRESHOLD` are sent as streams, as Cap'n Web sends each
// chunk in its own message, so a call can send several large values. Calls
// with more strings and bytes than `MAX_INLINE_SIZE` left in the message are
// rejected before they're sent.
const STREAMED_VALUE_THRESHOLD = 64 * 1024; // 64 KiB
const STREAMED_CHUNK_SIZE = 1024 * 1024; // 1 MiB
const MAX_INLINE_SIZE = 31 * 1024 * 1024; // 31 MiB, leaving room for the rest

const BYTES_CONSTRUCTORS: (new (buffer: ArrayBuffer) => ArrayBufferView)[] = [
	DataView,
	Int8Array,
	Uint8Array,
	Uint8ClampedArray,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array,
	Float64Array,
	BigInt64Array,
	BigUint64Array,
];

// Registered globally, as streams may be passed between proxies created by
// different loaded copies of Miniflare (e.g. the Vitest plugin and Wrangler
// resolving separate installs), which would otherwise each have their own
// distinct symbol and never see the length.
const kStreamLength: unique symbol = Symbol.for("miniflare.kStreamLength");

/**
 * Records the length of a stream received from the `ProxyServer`, so APIs that
 * require streams of known length (e.g. `R2Bucket#put()`) accept it if it's
 * passed back.
 *
 * @param stream Stream to record the length of
 * @param length Number of bytes in `stream`
 */
export function setStreamLength(stream: object, length: number): void {
	Object.defineProperty(stream, kStreamLength, { value: length });
}

/**
 * Prepares an error to be sent over Cap'n Web, preserving its name. Pass this
 * as the session's `onSendError` option.
 *
 * @param error Error about to be sent
 * @returns Copy of `error` to send instead, if its name needs preserving
 */
export function prepareErrorForSend(error: Error): Error | undefined {
	if (BUILT_IN_ERROR_NAMES.has(error.name)) {
		return;
	}
	// Copy the error rather than mutating it, as it may be sent again
	const copy = Object.assign(new Error(error.message), error, {
		[ERROR_NAME_KEY]: error.name,
	});
	if ("cause" in error) {
		copy.cause = error.cause;
	}
	// Omit our stack, it's not useful to the receiver
	copy.stack = undefined;
	return copy;
}

/**
 * Restores error names sent by {@link prepareErrorForSend}.
 *
 * @param error Value thrown by, or returned over, Cap'n Web
 */
export function restoreErrorName(error: unknown): void {
	if (!(error instanceof Error)) {
		return;
	}
	if (ERROR_NAME_KEY in error) {
		const record = error as unknown as Record<string, unknown>;
		const name = record[ERROR_NAME_KEY];
		delete record[ERROR_NAME_KEY];
		if (typeof name === "string") {
			error.name = name;
		}
	}
	restoreErrorName(error.cause);
}

function isPlainObject(value: object): value is Record<string, unknown> {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * @param value Value received over Cap'n Web
 * @returns Whether `value` was encoded by {@link ProxyCodec}
 */
function isProxyEncoded(value: unknown): value is ProxyEncoded {
	return (
		typeof value === "object" &&
		value !== null &&
		isPlainObject(value) &&
		typeof value[PROXY_ENCODED_KEY] === "string"
	);
}

// Cap'n Web drops keys like `constructor` and `toJSON` to prevent prototype
// pollution, and objects with our own key would be mistaken for encoded values
function needsEntriesEncoding(value: object): boolean {
	return Object.keys(value).some(
		(key) =>
			key in Object.prototype || key === "toJSON" || key === PROXY_ENCODED_KEY
	);
}

/**
 * @param bytes Bytes to stream, which must not be changed afterwards
 * @returns Stream of `bytes`, in chunks small enough for `workerd`
 */
function toChunkedStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
	let offset = 0;
	return new ReadableStream({
		pull(controller) {
			const end = Math.min(offset + STREAMED_CHUNK_SIZE, bytes.byteLength);
			controller.enqueue(bytes.subarray(offset, end));
			offset = end;
			if (offset === bytes.byteLength) {
				controller.close();
			}
		},
	});
}

/**
 * @param stream Stream to send to `workerd`
 * @returns Stream of the same chunks, with bytes split into chunks small
 * enough for `workerd`
 */
function splitChunks(stream: ReadableStream): ReadableStream {
	return stream.pipeThrough(
		new TransformStream({
			transform(chunk, controller) {
				if (
					!ArrayBuffer.isView(chunk) ||
					chunk.byteLength <= STREAMED_CHUNK_SIZE
				) {
					controller.enqueue(chunk);
					return;
				}
				const bytes = new Uint8Array(
					chunk.buffer,
					chunk.byteOffset,
					chunk.byteLength
				);
				for (let i = 0; i < bytes.byteLength; i += STREAMED_CHUNK_SIZE) {
					controller.enqueue(bytes.subarray(i, i + STREAMED_CHUNK_SIZE));
				}
			},
		})
	);
}

/**
 * State tracked while encoding the values sent to `workerd` in one message.
 * Only the client sends values to `workerd`, as it limits the size of messages
 * it receives, not those it sends.
 */
export interface EncodeState {
	/** Bytes of strings and bytes inlined in the message so far */
	inlineSize: number;
}

/**
 * Throws if values encoded with `state` would make a message `workerd` can't
 * receive.
 *
 * @param state State used to encode the values
 */
export function assertInlineSize(state: EncodeState): void {
	if (state.inlineSize > MAX_INLINE_SIZE) {
		throw new RangeError(
			"Arguments sent to the Workers runtime from Node.js must be less than 32 MiB once serialised"
		);
	}
}

/**
 * Value codec shared by the proxy client and server. Encodes values Cap'n Web
 * can't send itself (e.g. `Map`s, `Set`s and objects with keys like
 * `constructor`), and decodes them on the other side. Subclasses implement how
 * each side sends and receives objects that are passed by reference.
 */
export abstract class ProxyCodec {
	/**
	 * Encodes `value` for {@link ProxyCodec#encode} if this side handles it
	 * specially (e.g. proxies on the client, or R2 objects on the server).
	 *
	 * @returns Encoded value, or `undefined` if `value` isn't special
	 */
	protected abstract encodeSpecial(value: object): unknown | undefined;
	/** Encodes a function, or object Cap'n Web can't serialise. */
	protected abstract encodeReference(value: object): unknown;
	/** Decodes a Cap'n Web stub received from the other side. */
	protected abstract decodeStub(stub: RpcStub<never>): unknown;
	/** Decodes encoded values with types specific to this side. */
	protected abstract decodeSpecial(encoded: ProxyEncoded): unknown;

	/**
	 * Encodes a value to send over Cap'n Web.
	 *
	 * @param value Value to send
	 * @param state State shared by all values sent to `workerd` in the same
	 * message, if sending to `workerd`
	 * @returns Value Cap'n Web can serialise
	 */
	encode(value: unknown, state?: EncodeState): unknown {
		if (typeof value === "string") {
			if (state !== undefined) {
				const bytes = new TextEncoder().encode(value);
				if (bytes.byteLength > STREAMED_VALUE_THRESHOLD) {
					return {
						[PROXY_ENCODED_KEY]: "String",
						value: toChunkedStream(bytes),
					};
				}
				state.inlineSize += bytes.byteLength;
			}
			return value;
		}
		if (
			(typeof value !== "object" || value === null) &&
			typeof value !== "function"
		) {
			return value;
		}
		const special = this.encodeSpecial(value);
		if (special !== undefined) {
			return special;
		}
		if (typeof value === "function") {
			return this.encodeReference(value);
		}
		if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
			if (state === undefined) {
				return value;
			}
			const bytes =
				value instanceof ArrayBuffer
					? new Uint8Array(value)
					: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
			if (bytes.byteLength > STREAMED_VALUE_THRESHOLD) {
				// Subclasses like Node.js `Buffer` are revived as their standard parent
				const type =
					value instanceof ArrayBuffer
						? "ArrayBuffer"
						: (BYTES_CONSTRUCTORS.find((ctor) => value instanceof ctor)?.name ??
							"Uint8Array");
				// Copy the bytes, so later changes aren't sent
				return {
					[PROXY_ENCODED_KEY]: "Bytes",
					value: [toChunkedStream(bytes.slice()), type],
				};
			}
			// Cap'n Web base64 encodes bytes
			state.inlineSize += Math.ceil(bytes.byteLength / 3) * 4;
			return value;
		}
		if (Array.isArray(value)) {
			return value.map((v) => this.encode(v, state));
		}
		if (isPlainObject(value)) {
			if (needsEntriesEncoding(value)) {
				return {
					[PROXY_ENCODED_KEY]: "Object",
					value: Object.entries(value).map(([k, v]) => [
						k,
						this.encode(v, state),
					]),
				};
			}
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = this.encode(v, state);
			}
			return result;
		}
		if (value instanceof Map) {
			return {
				[PROXY_ENCODED_KEY]: "Map",
				value: Array.from(value, ([k, v]) => [
					this.encode(k, state),
					this.encode(v, state),
				]),
			};
		}
		if (value instanceof Set) {
			return {
				[PROXY_ENCODED_KEY]: "Set",
				value: Array.from(value, (v) => this.encode(v, state)),
			};
		}
		if (value instanceof RegExp) {
			return {
				[PROXY_ENCODED_KEY]: "RegExp",
				value: [value.source, value.flags],
			};
		}
		if (value instanceof Blob) {
			const file =
				value instanceof File ? [value.name, value.lastModified] : [];
			let content: Blob | ReadableStream;
			if (state !== undefined) {
				// Cap'n Web sends `Blob`s as a stream of their chunks, which may be too
				// large for `workerd` (e.g. Node.js streams `Blob`s as one chunk)
				content = splitChunks(value.stream());
			} else if (
				file.length === 0 &&
				Object.getPrototypeOf(value) === Blob.prototype
			) {
				return value;
			} else {
				// Cap'n Web only accepts exact `Blob`s
				content = new Blob([value], { type: value.type });
			}
			return {
				[PROXY_ENCODED_KEY]: "Blob",
				value: [content, value.type, ...file],
			};
		}
		if (value instanceof ReadableStream) {
			const length = (value as { [kStreamLength]?: number })[kStreamLength];
			const stream = state === undefined ? value : splitChunks(value);
			if (length !== undefined) {
				return { [PROXY_ENCODED_KEY]: "Stream", value: [stream, length] };
			}
			return stream;
		}
		if (
			value instanceof Date ||
			value instanceof Error ||
			value instanceof URL ||
			value instanceof WritableStream ||
			value instanceof Headers ||
			value instanceof Request ||
			value instanceof Response
		) {
			return value;
		}
		return this.encodeReference(value);
	}

	/**
	 * Decodes a value received over Cap'n Web.
	 *
	 * @param value Value received
	 * @returns Value with the same fidelity as Workers RPC
	 */
	async decode(value: unknown): Promise<unknown> {
		if (
			(typeof value !== "object" || value === null) &&
			typeof value !== "function"
		) {
			return value;
		}
		// Includes `RpcPromise`s, which extend `RpcStub`
		if (value instanceof RpcStub) {
			return this.decodeStub(value as RpcStub<never>);
		}
		if (Array.isArray(value)) {
			return Promise.all(value.map((v) => this.decode(v)));
		}
		if (isProxyEncoded(value)) {
			return this.#decodeEncoded(value);
		}
		if (value instanceof Error) {
			restoreErrorName(value);
			return value;
		}
		if (typeof value === "object" && isPlainObject(value)) {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = await this.decode(v);
			}
			return result;
		}
		return value;
	}

	async #decodeEncoded(encoded: ProxyEncoded): Promise<unknown> {
		const value = encoded.value;
		switch (encoded[PROXY_ENCODED_KEY]) {
			case "Map":
				return new Map(
					await Promise.all(
						(value as [unknown, unknown][]).map(
							async ([k, v]): Promise<[unknown, unknown]> => [
								await this.decode(k),
								await this.decode(v),
							]
						)
					)
				);
			case "Set":
				return new Set(
					await Promise.all((value as unknown[]).map((v) => this.decode(v)))
				);
			case "Object": {
				const result = {};
				for (const [k, v] of value as [string, unknown][]) {
					// Define rather than assign, so `__proto__` isn't treated specially
					Object.defineProperty(result, k, {
						value: await this.decode(v),
						enumerable: true,
						writable: true,
						configurable: true,
					});
				}
				return result;
			}
			case "RegExp": {
				const [source, flags] = value as [string, string];
				return new RegExp(source, flags);
			}
			case "Blob": {
				const [content, type, name, lastModified] = value as [
					Blob | ReadableStream,
					string,
					string?,
					number?,
				];
				const parts = [
					content instanceof Blob
						? content
						: await new Response(content).blob(),
				];
				return name === undefined
					? new Blob(parts, { type })
					: new File(parts, name, { type, lastModified });
			}
			case "String":
				return new Response(value as ReadableStream).text();
			case "Bytes": {
				const [stream, type] = value as [ReadableStream, string];
				const buffer = await new Response(stream).arrayBuffer();
				if (type === "ArrayBuffer") {
					return buffer;
				}
				const BytesConstructor =
					BYTES_CONSTRUCTORS.find((ctor) => ctor.name === type) ?? Uint8Array;
				return new BytesConstructor(buffer);
			}
		}
		return this.decodeSpecial(encoded);
	}
}
