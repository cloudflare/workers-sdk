import assert from "node:assert";
import { Buffer } from "node:buffer";
import { parse, stringify } from "devalue";
import type {
	Blob as WorkerBlob,
	BlobOptions as WorkerBlobOptions,
	File as WorkerFile,
	FileOptions as WorkerFileOptions,
	Headers as WorkerHeaders,
	ReadableStream as WorkerReadableStream,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";

// This file implements `devalue` reducers and revivers for structured-
// serialisable types not supported by default. See serialisable types here:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type ReducerReviver = (value: unknown) => unknown;
export type ReducersRevivers = Record<string, ReducerReviver>;

const ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS = [
	DataView<ArrayBuffer>,
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
] as const;
const ALLOWED_ERROR_CONSTRUCTORS = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
	Error, // `Error` last so more specific error subclasses preferred
] as const;

export const structuredSerializableReducers: ReducersRevivers = {
	ArrayBuffer(value) {
		if (value instanceof ArrayBuffer) {
			// Return single element array so empty `ArrayBuffer` serialised as truthy
			return [Buffer.from(value).toString("base64")];
		}
	},
	ArrayBufferView(value) {
		if (ArrayBuffer.isView(value)) {
			let name = value.constructor.name;
			// Subclasses like Node.js `Buffer` extend standard typed arrays but
			// aren't available in all runtimes. Normalise to the parent constructor.
			if (
				!ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.some((c) => c.name === name)
			) {
				for (const ctor of ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS) {
					if (value instanceof ctor) {
						name = ctor.name;
						break;
					}
				}
			}
			let buf = value.buffer;
			let off = value.byteOffset;
			if (off !== 0 || buf.byteLength !== value.byteLength) {
				buf = buf.slice(off, off + value.byteLength);
				off = 0;
			}
			return [name, buf, off, value.byteLength];
		}
	},
	RegExp(value) {
		if (value instanceof RegExp) {
			const { source, flags } = value;
			const encoded = Buffer.from(source).toString("base64");
			return flags ? ["RegExp", encoded, flags] : ["RegExp", encoded];
		}
	},
	Error(value) {
		for (const ctor of ALLOWED_ERROR_CONSTRUCTORS) {
			if (value instanceof ctor && value.name === ctor.name) {
				return [value.name, value.message, value.stack, value.cause];
			}
		}
		if (value instanceof Error) {
			return ["Error", value.message, value.stack, value.cause];
		}
	},
};
export const structuredSerializableRevivers: ReducersRevivers = {
	ArrayBuffer(value) {
		assert(Array.isArray(value));
		const [encoded] = value as unknown[];
		assert(typeof encoded === "string");
		const view = Buffer.from(encoded, "base64");
		return view.buffer.slice(
			view.byteOffset,
			view.byteOffset + view.byteLength
		);
	},
	ArrayBufferView(value) {
		assert(Array.isArray(value));
		const [name, buffer, byteOffset, byteLength] = value as unknown[];
		assert(typeof name === "string");
		assert(buffer instanceof ArrayBuffer);
		assert(typeof byteOffset === "number");
		assert(typeof byteLength === "number");
		const ctor = (globalThis as Record<string, unknown>)[
			name
		] as (typeof ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS)[number];
		assert(ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.includes(ctor));
		let length = byteLength;
		if ("BYTES_PER_ELEMENT" in ctor) length /= ctor.BYTES_PER_ELEMENT;
		return new ctor(buffer as ArrayBuffer, byteOffset, length);
	},
	RegExp(value) {
		assert(Array.isArray(value));
		const [name, encoded, flags] = value;
		assert(typeof name === "string");
		assert(typeof encoded === "string");
		const source = Buffer.from(encoded, "base64").toString("utf-8");
		return new RegExp(source, flags);
	},
	Error(value) {
		assert(Array.isArray(value));
		const [name, message, stack, cause] = value as unknown[];
		assert(typeof name === "string");
		assert(typeof message === "string");
		assert(stack === undefined || typeof stack === "string");
		const ctor = (globalThis as Record<string, unknown>)[
			name
		] as (typeof ALLOWED_ERROR_CONSTRUCTORS)[number];
		assert(ALLOWED_ERROR_CONSTRUCTORS.includes(ctor));
		const error = new ctor(message, { cause });
		error.stack = stack;
		return error;
	},
};

// This file gets imported both by Node and workers. These platforms have
// different ways of accessing/performing operations required by this code.
// This interface should be implemented by both platforms to provide this
// functionality. `RS` is the type of `ReadableStream`.
export interface PlatformImpl<RS> {
	Blob: typeof WorkerBlob;
	File: typeof WorkerFile;
	Headers: typeof WorkerHeaders;
	Request: typeof WorkerRequest;
	Response: typeof WorkerResponse;

	isReadableStream(value: unknown): value is RS;
	bufferReadableStream(stream: RS): Promise<ArrayBuffer>;
	unbufferReadableStream(buffer: ArrayBuffer): RS;
}

export function createHTTPReducers(
	impl: PlatformImpl<unknown>
): ReducersRevivers {
	return {
		Headers(val) {
			if (val instanceof impl.Headers) return [...val.entries()];
		},
		Request(val) {
			if (val instanceof impl.Request) {
				return [val.method, val.url, val.headers, val.cf, val.body];
			}
		},
		Response(val) {
			if (val instanceof impl.Response) {
				return [val.status, val.statusText, val.headers, val.cf, val.body];
			}
		},
	};
}
export function createHTTPRevivers<RS>(
	impl: PlatformImpl<RS>
): ReducersRevivers {
	return {
		Headers(value) {
			assert(typeof value === "object" && value !== null);
			return new impl.Headers(value as string[][]);
		},
		Request(value) {
			assert(Array.isArray(value));
			const [method, url, headers, cf, body] = value as unknown[];
			assert(typeof method === "string");
			assert(typeof url === "string");
			assert(headers instanceof impl.Headers);
			assert(body === null || impl.isReadableStream(body));
			return new impl.Request(url, {
				method,
				headers,
				cf,
				// @ts-expect-error `duplex` is not required by `workerd` yet
				duplex: body === null ? undefined : "half",
				body: body as WorkerReadableStream | null,
			});
		},
		Response(value) {
			assert(Array.isArray(value));
			const [status, statusText, headers, cf, body] = value as unknown[];
			assert(typeof status === "number");
			assert(typeof statusText === "string");
			assert(headers instanceof impl.Headers);
			assert(body === null || impl.isReadableStream(body));
			return new impl.Response(body as WorkerReadableStream | null, {
				status,
				statusText,
				headers,
				cf,
			});
		},
	};
}

export interface StringifiedWithStream<RS> {
	value: string;
	unbufferedStream?: RS;
}
// `devalue` `stringify()` that allows a single stream to be "unbuffered", and
// sent separately. Other streams will be buffered.
export function stringifyWithStreams<RS>(
	impl: PlatformImpl<RS>,
	value: unknown,
	reducers: ReducersRevivers,
	allowUnbufferedStream: boolean
): StringifiedWithStream<RS> | Promise<StringifiedWithStream<RS>> {
	let unbufferedStream: RS | undefined;
	// The tricky thing here is that `devalue` `stringify()` is synchronous, and
	// doesn't support asynchronous reducers. Assuming we visit values in the same
	// order each time, we can use an array to store buffer promises.
	const bufferPromises: Promise<ArrayBuffer>[] = [];
	const streamReducers: ReducersRevivers = {
		ReadableStream(value) {
			if (impl.isReadableStream(value)) {
				if (allowUnbufferedStream && unbufferedStream === undefined) {
					unbufferedStream = value;
				} else {
					bufferPromises.push(impl.bufferReadableStream(value));
				}
				// Using `true` to signify unbuffered stream, buffered streams will
				// have this replaced with an `ArrayBuffer` on the 2nd `stringify()`
				// If we don't have any buffer promises, this will encode to the correct
				// value, so we don't need to re-`stringify()`.
				return true;
			}
		},
		Blob(value) {
			if (value instanceof impl.Blob) {
				// `Blob`s are always buffered. We can't just serialise with a stream
				// here (and recursively use the reducer above), because `workerd`
				// doesn't allow us to synchronously reconstruct a `Blob` from a stream:
				// its `new Blob([...])` doesn't support `ReadableStream` blob bits.
				bufferPromises.push(value.arrayBuffer());
				return true;
			}
		},

		...reducers,
	};
	if (typeof value === "function") {
		value = new __MiniflareFunctionWrapper(
			value as ConstructorParameters<typeof __MiniflareFunctionWrapper>[0]
		);
	}
	const stringifiedValue = stringify(value, streamReducers);
	// If we didn't need to buffer anything, we've just encoded correctly. Note
	// `unbufferedStream` may be undefined if the `value` didn't contain streams.
	// Note also in this case we're returning synchronously, so we can use this
	// for synchronous methods too.
	if (bufferPromises.length === 0) {
		return { value: stringifiedValue, unbufferedStream };
	}

	// Otherwise, wait for buffering to complete, and `stringify()` again with
	// a reducer that expects buffers.
	return Promise.all(bufferPromises).then((streamBuffers) => {
		// Again, we're assuming values are visited in the same order, so `shift()`
		// will give us the next correct buffer
		streamReducers.ReadableStream = function (value) {
			if (impl.isReadableStream(value)) {
				if (value === unbufferedStream) {
					return true;
				} else {
					return streamBuffers.shift();
				}
			}
		};
		streamReducers.Blob = function (value) {
			if (value instanceof impl.Blob) {
				const array: unknown[] = [streamBuffers.shift(), value.type];
				if (value instanceof impl.File) {
					array.push(value.name, value.lastModified);
				}
				return array;
			}
		};
		const stringifiedValue = stringify(value, streamReducers);
		return { value: stringifiedValue, unbufferedStream };
	});
}

// functions can't be stringified, so we wrap them into a class that we then use to pseudo-serialize them
// we also add a proxy and make sure that properties set on the function object are accessible
// (this is in particular necessary for RpcStubs)
export class __MiniflareFunctionWrapper {
	constructor(
		fnWithProps: ((...args: unknown[]) => unknown) & {
			[key: string | symbol]: unknown;
		}
	) {
		return new Proxy(this, {
			get: (_, key) => {
				if (key === "__miniflareWrappedFunction") return fnWithProps;
				return fnWithProps[key];
			},
		});
	}
}

export function parseWithReadableStreams<RS>(
	impl: PlatformImpl<RS>,
	stringified: StringifiedWithStream<RS>,
	revivers: ReducersRevivers
): unknown {
	const streamRevivers: ReducersRevivers = {
		ReadableStream(value) {
			if (value === true) {
				assert(stringified.unbufferedStream !== undefined);
				return stringified.unbufferedStream;
			}
			assert(value instanceof ArrayBuffer);
			return impl.unbufferReadableStream(value);
		},
		Blob(value) {
			assert(Array.isArray(value));
			if (value.length === 2) {
				// Blob
				const [buffer, type] = value as unknown[];
				assert(buffer instanceof ArrayBuffer);
				assert(typeof type === "string");
				const opts: WorkerBlobOptions = {};
				if (type !== "") opts.type = type;
				return new impl.Blob([buffer], opts);
			} else {
				// File
				assert(value.length === 4);
				const [buffer, type, name, lastModified] = value as unknown[];
				assert(buffer instanceof ArrayBuffer);
				assert(typeof type === "string");
				assert(typeof name === "string");
				assert(typeof lastModified === "number");
				const opts: WorkerFileOptions = { lastModified };
				if (type !== "") opts.type = type;
				return new impl.File([buffer], name, opts);
			}
		},
		...revivers,
	};

	return parse(stringified.value, streamRevivers);
}
