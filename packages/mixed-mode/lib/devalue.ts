import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { parse, stringify } from 'devalue';

// This file implements `devalue` reducers and revivers for structured-
// serialisable types not supported by default. See serialisable types here:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type ReducerReviver = (value: unknown) => unknown;
export type ReducersRevivers = Record<string, ReducerReviver>;

const ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS = [
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
] as const;

type ArrayBufferConstructor = ConstructorParameters<(typeof ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS)[number]>;

const ALLOWED_ERROR_CONSTRUCTORS = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
	Error, // `Error` last so more specific error subclasses preferred
] as const;

type ErrorConstructor = ConstructorParameters<(typeof ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS)[number]>;

function isReadableStream(value: unknown): value is ReadableStream {
	return value instanceof ReadableStream;
}
function bufferReadableStream(stream: BodyInit) {
	return new Response(stream).arrayBuffer();
}
function unbufferReadableStream(buffer: BodyInit) {
	const body = new Response(buffer).body;
	assert(body !== null);
	return body;
}

export const structuredSerializableReducers: ReducersRevivers = {
	ArrayBuffer(value) {
		if (value instanceof ArrayBuffer) {
			// Return single element array so empty `ArrayBuffer` serialised as truthy
			return [Buffer.from(value).toString('base64')];
		}
	},
	ArrayBufferView(value) {
		if (ArrayBuffer.isView(value)) {
			return [value.constructor.name, value.buffer, value.byteOffset, value.byteLength];
		}
	},
	Error(value) {
		for (const ctor of ALLOWED_ERROR_CONSTRUCTORS) {
			if (value instanceof ctor && value.name === ctor.name) {
				return [value.name, value.message, value.stack, 'cause' in value ? value.cause : undefined];
			}
		}
		if (value instanceof Error) {
			return ['Error', value.message, value.stack, 'cause' in value ? value.cause : undefined];
		}
	},
};
export const structuredSerializableRevivers: ReducersRevivers = {
	ArrayBuffer(value) {
		assert(Array.isArray(value));
		const [encoded] = value as unknown[];
		assert(typeof encoded === 'string');
		const view = Buffer.from(encoded, 'base64');
		return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
	},
	ArrayBufferView(value) {
		assert(Array.isArray(value));
		const [name, buffer, byteOffset, byteLength] = value as unknown[];
		assert(typeof name === 'string');
		assert(buffer instanceof ArrayBuffer);
		assert(typeof byteOffset === 'number');
		assert(typeof byteLength === 'number');
		const ctor = (globalThis as Record<string, unknown>)[name] as (typeof ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS)[number];
		assert(ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.includes(ctor));
		let length = byteLength;
		if ('BYTES_PER_ELEMENT' in ctor) length /= ctor.BYTES_PER_ELEMENT;

		// TS gets a bit confused without this cast
		return new (ctor as new (...params: ArrayBufferConstructor) => unknown)(buffer, byteOffset, length);
	},
	Error(value) {
		assert(Array.isArray(value));
		const [name, message, stack, cause] = value as unknown[];
		assert(typeof name === 'string');
		assert(typeof message === 'string');
		assert(stack === undefined || typeof stack === 'string');
		const ctor = (globalThis as Record<string, unknown>)[name] as (typeof ALLOWED_ERROR_CONSTRUCTORS)[number];
		assert(ALLOWED_ERROR_CONSTRUCTORS.includes(ctor));

		// @ts-expect-error { cause } is valid
		const error = new ctor(message, { cause });
		error.stack = stack;
		return error;
	},
};

export function createHTTPReducers(): ReducersRevivers {
	return {
		Headers(val) {
			if (val instanceof Headers) return Object.fromEntries(val);
		},
		Request(val) {
			if (val instanceof Request) {
				return [val.method, val.url, val.headers, val.cf, val.body];
			}
		},
		Response(val) {
			if (val instanceof Response) {
				return [val.status, val.statusText, val.headers, val.cf, val.body];
			}
		},
	};
}

function isObject(value: unknown): value is Record<string | number | symbol, unknown> {
	return !!value && typeof value === 'object';
}

function isInternal(value: unknown): value is Record<string | number | symbol, unknown> {
	return isObject(value) && !!value[Symbol.for('cloudflare:internal-class')];
}

class ClassMethod {
	constructor(
		public name: string,
		public fn: Function,
	) {}
}

const precomputableFunctions = {
	'Checksums::toJSON': (fn: () => unknown) => fn(),
	'HeadResult::writeHttpMetadata': (fn: (headers: Headers) => Headers) => {
		const h = new Headers();
		fn(h);
		return h;
	},
	'GetResult::writeHttpMetadata': (fn: (headers: Headers) => Headers) => {
		const h = new Headers();
		fn(h);
		return h;
	},
};

const precomputableFunctionsRevivers = {
	'Checksums::toJSON': (v: unknown) => () => v,
	'HeadResult::writeHttpMetadata': (v: Headers) => (headers: Headers) => {
		for (const [name, value] of v.entries()) {
			headers.set(name, value);
		}
	},
	'GetResult::writeHttpMetadata': (v: Headers) => (headers: Headers) => {
		for (const [name, value] of v.entries()) {
			headers.set(name, value);
		}
	},
};

export type ChainItem =
	| {
			type: 'get';
			property: string | symbol;
	  }
	| {
			type: 'apply';
			arguments: string[];
	  };

export class UnresolvedChain {
	constructor(public chainProxy: { chain: ChainItem[]; targetHeapId: unknown }) {}
}

export function createCloudflareReducers(heap?: Map<string, unknown>): ReducersRevivers {
	return {
		RpcStub(val) {
			if (val !== null && typeof val === 'object' && val.constructor.name === 'RpcStub' && heap) {
				const id = crypto.randomUUID();
				if (!heap) {
					throw new Error('Attempted to use heap on client');
				}
				heap.set(id, '__miniflareWrappedFunction' in val ? val['__miniflareWrappedFunction'] : val);
				return id;
			}
		},
		UnresolvedChain(val) {
			if (val instanceof UnresolvedChain) {
				return val.chainProxy;
			}
		},
		InternalClass(val) {
			if (isInternal(val)) {
				let stream: ReadableStream | undefined = undefined;
				if (val.body instanceof ReadableStream) {
					stream = val.body;
				}

				let methods = [];

				if (typeof val.writeHttpMetadata === 'function') {
					methods.push('writeHttpMetadata');
				}

				if (typeof val.toJSON === 'function') {
					methods.push('toJSON');
				}

				return [
					val.constructor.name,
					{
						...val,
						...Object.fromEntries(
							methods
								.filter((m) => typeof val[m] === 'function')
								.map((m) => [m, new ClassMethod(`${val.constructor.name}::${m}`, (val[m] as Function).bind(val))]),
						),
					},
					stream,
				];
			}
		},
		PreComputableClassMethod(val) {
			if (val instanceof ClassMethod && val.name in precomputableFunctions) {
				// @ts-expect-error val.fn is valid here
				return [val.name, precomputableFunctions[val.name as keyof typeof precomputableFunctions](val.fn)];
			}
		},
	};
}

export function createCloudflareRevivers(heap?: Map<string, unknown>, stubProxy?: (id: string) => unknown): ReducersRevivers {
	return {
		RpcStub(id: unknown) {
			if (typeof id !== 'string') {
				throw new Error('RpcStub with wrong ID');
			}

			if (heap) {
				return heap.get(id);
			} else {
				if (stubProxy === undefined) {
					throw new Error("Can't inflate RpcStub");
				}
				return stubProxy(id);
			}
		},
		UnresolvedChain(val) {
			// @ts-expect-error this is fine
			return new UnresolvedChain(val);
		},
		InternalClass(val) {
			const kls = {};
			Object.defineProperty(kls.constructor, 'name', {
				// @ts-expect-error this is fine
				value: val[0],
				writable: false,
			});
			// @ts-expect-error this is fine
			Object.assign(kls, val[1]);
			// @ts-expect-error this is fine
			if (val[2]) {
				// @ts-expect-error this is fine
				const r = new Response(val[2]);
				Object.assign(kls, {
					body: r.body,
					bodyUsed: r.bodyUsed,
					json: r.json.bind(r),
					arrayBuffer: r.arrayBuffer.bind(r),
					text: r.text.bind(r),
					blob: r.blob.bind(r),
				});
			}
			return kls;
		},
		PreComputableClassMethod(val) {
			// @ts-expect-error this is fine
			return precomputableFunctionsRevivers[val[0]](val[1]);
		},
	};
}
async function writeWithUnbufferedStream(writable: WritableStream, encodedValue: Uint8Array, unbufferedStream: ReadableStream) {
	const writer = writable.getWriter();
	await writer.write(encodedValue);
	writer.releaseLock();
	await unbufferedStream.pipeTo(writable);
}
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export async function toStream(value: unknown, reducers: ReducersRevivers): Promise<[ReadableStream | string, Headers]> {
	const stringified = await stringifyWithStreams(value, reducers, true);

	// console.log(stringified);

	if (stringified.unbufferedStream === undefined) {
		return [stringified.value, new Headers()];
	} else {
		const body = new IdentityTransformStream();
		const headers = new Headers();
		const encodedValue = ENCODER.encode(stringified.value);
		const encodedSize = encodedValue.byteLength.toString();
		headers.set('X-Size', encodedSize);

		void writeWithUnbufferedStream(body.writable, encodedValue, stringified.unbufferedStream);
		return [body.readable, headers];
	}
}

async function readPrefix(stream: ReadableStream<Uint8Array>, prefixLength: number): Promise<[prefix: Uint8Array, rest: ReadableStream]> {
	const reader = await stream.getReader({ mode: 'byob' });
	const result = await reader.readAtLeast(prefixLength, new Uint8Array(prefixLength));
	assert(result.value !== undefined);
	reader.releaseLock();
	// Without this `pipeThrough()`, getting uncaught `TypeError: Can't read from
	// request stream after response has been sent.`
	const rest = stream.pipeThrough(new IdentityTransformStream());
	return [result.value!, rest];
}

export async function fromStream<T>(value: Response | Request, revivers: ReducersRevivers): Promise<T> {
	let stringifiedResult: string;
	let unbufferedStream: ReadableStream | undefined;
	const stringifiedSizeHeader = value.headers.get('X-Size');

	if (stringifiedSizeHeader === null) {
		// No unbuffered stream
		stringifiedResult = await value.text();
	} else {
		// Response contains unbuffered `ReadableStream`
		const stringifiedSize = parseInt(stringifiedSizeHeader);
		assert(!Number.isNaN(stringifiedSize));
		assert(value.body !== null);
		const [buffer, rest] = await readPrefix(value.body!, stringifiedSize);

		stringifiedResult = DECODER.decode(buffer);
		// Need to `.pipeThrough()` here otherwise we'll get
		// `TypeError: Response body object should not be disturbed or locked`
		// when trying to construct a `Response` with the stream.
		// TODO(soon): add support for MINIFLARE_ASSERT_BODIES_CONSUMED here
		unbufferedStream = rest.pipeThrough(new TransformStream());
	}

	return parseWithReadableStreams<T>({ value: stringifiedResult, unbufferedStream }, revivers);
}

export function createHTTPRevivers(): ReducersRevivers {
	return {
		Headers(value) {
			assert(typeof value === 'object' && value !== null);
			return new Headers(value as Record<string, string>);
		},
		Request(value) {
			assert(Array.isArray(value));
			const [method, url, headers, cf, body] = value as unknown[];
			assert(typeof method === 'string');
			assert(typeof url === 'string');
			assert(headers instanceof Headers);
			assert(body === null || isReadableStream(body));
			return new Request(url, {
				method,
				headers,
				cf,
				// @ts-expect-error `duplex` is not required by `workerd` yet
				duplex: body === null ? undefined : 'half',
				body: body as ReadableStream | null,
			});
		},
		Response(value) {
			assert(Array.isArray(value));
			const [status, statusText, headers, cf, body] = value as unknown[];
			assert(typeof status === 'number');
			assert(typeof statusText === 'string');
			assert(headers instanceof Headers);
			assert(body === null || isReadableStream(body));
			return new Response(body as ReadableStream | null, {
				status,
				statusText,
				headers,
				cf,
			});
		},
	};
}

export interface StringifiedWithStream {
	value: string;
	unbufferedStream?: ReadableStream;
}
// `devalue` `stringify()` that allows a single stream to be "unbuffered", and
// sent separately. Other streams will be buffered.
export function stringifyWithStreams(
	value: unknown,
	reducers: ReducersRevivers,
	allowUnbufferedStream: boolean,
): StringifiedWithStream | Promise<StringifiedWithStream> {
	let unbufferedStream: ReadableStream | undefined;
	// The tricky thing here is that `devalue` `stringify()` is synchronous, and
	// doesn't support asynchronous reducers. Assuming we visit values in the same
	// order each time, we can use an array to store buffer promises.
	const bufferPromises: Promise<ArrayBuffer>[] = [];
	const streamReducers: ReducersRevivers = {
		ReadableStream(value) {
			if (isReadableStream(value)) {
				if (allowUnbufferedStream && unbufferedStream === undefined) {
					unbufferedStream = value;
				} else {
					bufferPromises.push(bufferReadableStream(value));
				}
				// Using `true` to signify unbuffered stream, buffered streams will
				// have this replaced with an `ArrayBuffer` on the 2nd `stringify()`
				// If we don't have any buffer promises, this will encode to the correct
				// value, so we don't need to re-`stringify()`.
				return true;
			}
		},
		Blob(value) {
			if (value instanceof Blob) {
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
	if (typeof value === 'function') {
		value = new __MiniflareFunctionWrapper(value as ConstructorParameters<typeof __MiniflareFunctionWrapper>[0]);
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
			if (isReadableStream(value)) {
				if (value === unbufferedStream) {
					return true;
				} else {
					return streamBuffers.shift();
				}
			}
		};
		streamReducers.Blob = function (value) {
			if (value instanceof Blob) {
				const array: unknown[] = [streamBuffers.shift(), value.type];
				if (value instanceof File) {
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
		},
	) {
		return new Proxy(this, {
			get: (_, key) => {
				if (key === '__miniflareWrappedFunction') return fnWithProps;
				return fnWithProps[key];
			},
		});
	}
}

export function parseWithReadableStreams<T>(stringified: StringifiedWithStream, revivers: ReducersRevivers): T {
	const streamRevivers: ReducersRevivers = {
		ReadableStream(value) {
			if (value === true) {
				assert(stringified.unbufferedStream !== undefined);
				return stringified.unbufferedStream;
			}
			assert(value instanceof ArrayBuffer);
			return unbufferReadableStream(value);
		},
		Blob(value) {
			assert(Array.isArray(value));
			if (value.length === 2) {
				// Blob
				const [buffer, type] = value as unknown[];
				assert(buffer instanceof ArrayBuffer);
				assert(typeof type === 'string');
				const opts: BlobOptions = {};
				if (type !== '') opts.type = type;
				return new Blob([buffer], opts);
			} else {
				// File
				assert(value.length === 4);
				const [buffer, type, name, lastModified] = value as unknown[];
				assert(buffer instanceof ArrayBuffer);
				assert(typeof type === 'string');
				assert(typeof name === 'string');
				assert(typeof lastModified === 'number');
				const opts: FileOptions = { lastModified };
				if (type !== '') opts.type = type;
				return new File([buffer], name, opts);
			}
		},
		...revivers,
	};

	return parse(stringified.value, streamRevivers);
}
