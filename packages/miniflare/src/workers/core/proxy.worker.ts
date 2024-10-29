import assert from "node:assert";
import { Buffer } from "node:buffer";
import { parse } from "devalue";
import { readPrefix, reduceError } from "miniflare:shared";
import {
	CoreBindings,
	CoreHeaders,
	isFetcherFetch,
	isR2ObjectWriteHttpMetadata,
	ProxyAddresses,
	ProxyOps,
} from "./constants";
import {
	__MiniflareFunctionWrapper,
	createHTTPReducers,
	createHTTPRevivers,
	parseWithReadableStreams,
	PlatformImpl,
	ReducersRevivers,
	stringifyWithStreams,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "./devalue";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const ALLOWED_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];

const WORKERS_PLATFORM_IMPL: PlatformImpl<ReadableStream> = {
	Blob,
	File,
	Headers,
	Request,
	Response,

	isReadableStream(value): value is ReadableStream {
		return value instanceof ReadableStream;
	},
	bufferReadableStream(stream) {
		return new Response(stream).arrayBuffer();
	},
	unbufferReadableStream(buffer) {
		const body = new Response(buffer).body;
		assert(body !== null);
		return body;
	},
};

// Helpers taken from `devalue` (unfortunately not exported):
// https://github.com/Rich-Harris/devalue/blob/50af63e2b2c648f6e6ea29904a14faac25a581fc/src/utils.js#L31-L51
const objectProtoNames = Object.getOwnPropertyNames(Object.prototype)
	.sort()
	.join("\0");
function isPlainObject(value: unknown) {
	const proto = Object.getPrototypeOf(value);
	if (value?.constructor?.name === "RpcStub") {
		return false;
	}
	if (isObject(value)) {
		const valueAsRecord = value as Record<string, unknown>;
		if (objectContainsFunctions(valueAsRecord)) {
			return false;
		}
	}
	return (
		proto === Object.prototype ||
		proto === null ||
		Object.getOwnPropertyNames(proto).sort().join("\0") === objectProtoNames
	);
}
function objectContainsFunctions(
	obj: Record<string | symbol, unknown>
): boolean {
	const propertyNames = Object.getOwnPropertyNames(obj);
	const propertySymbols = Object.getOwnPropertySymbols(obj);
	const properties = [...propertyNames, ...propertySymbols];

	for (const property of properties) {
		const entry = obj[property];
		if (typeof entry === "function") {
			return true;
		}
		if (
			isObject(entry) &&
			objectContainsFunctions(entry as Record<string, unknown>)
		) {
			return true;
		}
	}

	return false;
}

function isObject(
	value: unknown
): value is Record<string | number | symbol, unknown> {
	return !!value && typeof value === "object";
}

function getType(value: unknown) {
	return Object.prototype.toString.call(value).slice(8, -1); // `[object <type>]`
}

function isInternal(value: unknown) {
	return isObject(value) && value[Symbol.for("cloudflare:internal-class")];
}

type Env = Record<string, unknown> & {
	[CoreBindings.DATA_PROXY_SECRET]: ArrayBuffer;
};

// TODO(someday): extract `ProxyServer` into component that could be used by
//  other (user) Durable Objects
export class ProxyServer implements DurableObject {
	nextHeapAddress = ProxyAddresses.USER_START;
	readonly heap = new Map<number, unknown>();

	reducers: ReducersRevivers = {
		...structuredSerializableReducers,
		...createHTTPReducers(WORKERS_PLATFORM_IMPL),
		// Corresponding revivers in `ProxyClient`
		// `Native` reducer *MUST* be applied last
		Native: (value) => {
			// For instances of runtime API classes implemented in C++, `getType()`
			// should only ever return `Object`, as none override `Symbol.toStringTag`
			// https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.prototype.tostring
			const type = getType(value);
			if (
				((type === "Object" || isInternal(value)) && !isPlainObject(value)) ||
				type === "Promise"
			) {
				const address = this.nextHeapAddress++;
				this.heap.set(address, value);
				assert(value !== null);
				const name = value?.constructor.name;
				const isFunction = value instanceof __MiniflareFunctionWrapper;
				return [address, name, isFunction];
			}
		},
	};
	revivers: ReducersRevivers = {
		...structuredSerializableRevivers,
		...createHTTPRevivers(WORKERS_PLATFORM_IMPL),
		// Corresponding reducers in `ProxyClient`
		Native: (value) => {
			assert(Array.isArray(value));
			const [address] = value as unknown[];
			assert(typeof address === "number");
			const heapValue = this.heap.get(address);
			assert(heapValue !== undefined);
			// We should only store `Promise`s on the heap if we attempted to make a
			// synchronous GET/CALL that then returned a `Promise`. In that case,
			// we'll immediately make an asynchronous GET to resolve the `Promise`.
			// Rather than worrying about cleaning up `Promise`s some other way, we
			// just remove them from the heap immediately, since we should never make
			// a request to resolve them again.
			if (heapValue instanceof Promise) this.heap.delete(address);
			return heapValue;
		},
	};
	nativeReviver: ReducersRevivers = { Native: this.revivers.Native };

	constructor(
		_state: DurableObjectState,
		readonly env: Env
	) {
		this.heap.set(ProxyAddresses.GLOBAL, globalThis);
		this.heap.set(ProxyAddresses.ENV, env);
	}

	async fetch(request: Request) {
		try {
			return await this.#fetch(request);
		} catch (e) {
			const error = reduceError(e);
			return Response.json(error, {
				status: 500,
				headers: { [CoreHeaders.ERROR_STACK]: "true" },
			});
		}
	}

	async #fetch(request: Request) {
		// Validate `Host` header
		const hostHeader = request.headers.get("Host");
		if (hostHeader == null) return new Response(null, { status: 400 });
		try {
			const host = new URL(`http://${hostHeader}`);
			if (!ALLOWED_HOSTNAMES.includes(host.hostname)) {
				return new Response(null, { status: 401 });
			}
		} catch {
			return new Response(null, { status: 400 });
		}

		// Validate secret header to prevent unauthorised access to proxy
		const secretHex = request.headers.get(CoreHeaders.OP_SECRET);
		if (secretHex == null) return new Response(null, { status: 401 });
		const expectedSecret = this.env[CoreBindings.DATA_PROXY_SECRET];
		const secretBuffer = Buffer.from(secretHex, "hex");
		if (
			secretBuffer.byteLength !== expectedSecret.byteLength ||
			!crypto.subtle.timingSafeEqual(secretBuffer, expectedSecret)
		) {
			return new Response(null, { status: 401 });
		}

		const opHeader = request.headers.get(CoreHeaders.OP);
		const targetHeader = request.headers.get(CoreHeaders.OP_TARGET);
		const keyHeader = request.headers.get(CoreHeaders.OP_KEY);
		const allowAsync = request.headers.get(CoreHeaders.OP_SYNC) === null;
		const argsSizeHeader = request.headers.get(CoreHeaders.OP_STRINGIFIED_SIZE);
		const contentLengthHeader = request.headers.get("Content-Length");

		// Get target to perform operations on
		if (targetHeader === null) return new Response(null, { status: 400 });

		// If this is a FREE operation, remove the target(s) from the heap
		if (opHeader === ProxyOps.FREE) {
			for (const targetValue of targetHeader.split(",")) {
				const targetAddress = parseInt(targetValue);
				assert(!Number.isNaN(targetAddress));
				this.heap.delete(targetAddress);
			}
			return new Response(null, { status: 204 });
		}

		// Revive the target from the heap
		const target: Record<string, unknown> = parse(
			targetHeader,
			this.nativeReviver
		);
		const targetName = target.constructor.name;

		let status = 200;
		let result: unknown;
		let unbufferedRest: ReadableStream | undefined;
		if (opHeader === ProxyOps.GET) {
			// If no key header is specified, just return the target
			result = keyHeader === null ? target : target[keyHeader];

			// Immediately resolve all RpcProperties
			if (result?.constructor.name === "RpcProperty") result = await result;

			if (typeof result === "function") {
				// Calling functions-which-return-functions not yet supported
				return new Response(null, {
					status: 204,
					headers: { [CoreHeaders.OP_RESULT_TYPE]: "Function" },
				});
			}
		} else if (opHeader === ProxyOps.GET_OWN_DESCRIPTOR) {
			if (keyHeader === null) return new Response(null, { status: 400 });
			const descriptor = Object.getOwnPropertyDescriptor(target, keyHeader);
			if (descriptor !== undefined) {
				result = <PropertyDescriptor>{
					configurable: descriptor.configurable,
					enumerable: descriptor.enumerable,
					writable: descriptor.writable,
				};
			}
		} else if (opHeader === ProxyOps.GET_OWN_KEYS) {
			result = Object.getOwnPropertyNames(target);
		} else if (opHeader === ProxyOps.CALL) {
			assert(keyHeader !== null);
			const func = target[keyHeader];
			assert(typeof func === "function");

			// See `isFetcherFetch()` comment for why this special
			if (isFetcherFetch(targetName, keyHeader)) {
				const originalUrl = request.headers.get(CoreHeaders.ORIGINAL_URL);
				const url = new URL(originalUrl ?? request.url);
				// Create a new request to allow header mutation and use original URL
				request = new Request(url, request);
				request.headers.delete(CoreHeaders.OP_SECRET);
				request.headers.delete(CoreHeaders.OP);
				request.headers.delete(CoreHeaders.OP_TARGET);
				request.headers.delete(CoreHeaders.OP_KEY);
				request.headers.delete(CoreHeaders.ORIGINAL_URL);
				request.headers.delete(CoreHeaders.DISABLE_PRETTY_ERROR);
				return func.call(target, request);
			}

			let args: unknown;
			if (argsSizeHeader === null || argsSizeHeader === contentLengthHeader) {
				// No unbuffered `ReadableStream`
				args = parseWithReadableStreams(
					WORKERS_PLATFORM_IMPL,
					{ value: await request.text() },
					this.revivers
				);
			} else {
				// Unbuffered `ReadableStream` argument
				const argsSize = parseInt(argsSizeHeader);
				assert(!Number.isNaN(argsSize));
				assert(request.body !== null);
				const [encodedArgs, rest] = await readPrefix(request.body, argsSize);
				unbufferedRest = rest;
				const stringifiedArgs = DECODER.decode(encodedArgs);
				args = parseWithReadableStreams(
					WORKERS_PLATFORM_IMPL,
					{ value: stringifiedArgs, unbufferedStream: rest },
					this.revivers
				);
			}
			assert(Array.isArray(args));
			try {
				if (["RpcProperty", "RpcStub"].includes(func.constructor.name)) {
					// let's resolve RpcPromise instances right away (to support serialization)
					result = await func(...args);
				} else {
					result = func.apply(target, args);
				}

				// See `isR2ObjectWriteHttpMetadata()` comment for why this special
				if (isR2ObjectWriteHttpMetadata(targetName, keyHeader)) {
					result = args[0];
				}
			} catch (e) {
				status = 500;
				result = e;
			}
		} else {
			return new Response(null, { status: 404 });
		}

		const headers = new Headers();
		if (allowAsync && result instanceof Promise) {
			// Note we only resolve `Promise`s if we're allowing async operations.
			// Otherwise, we'll treat the `Promise` as a native target. This allows
			// us to use regular HTTP status/headers to indicate whether the `Promise`
			// resolved/rejected and whether the body should be interpreted as a raw
			// `ReadableStream`. Otherwise, we'd need to devise an encoding scheme for
			// this in the body.
			try {
				result = await result;
			} catch (e) {
				status = 500;
				result = e;
			}
			headers.append(CoreHeaders.OP_RESULT_TYPE, "Promise");
		}
		// Make sure we fully-consume the request body if it wasn't used (e.g. key
		// validation failed). Without this, we'll get a `TypeError: Can't read from
		// request stream after response has been sent.`
		// TODO(soon): remove once https://github.com/cloudflare/workerd/issues/918 fixed
		if (unbufferedRest !== undefined && !unbufferedRest.locked) {
			try {
				await unbufferedRest.pipeTo(new WritableStream());
			} catch {}
		}
		if (result instanceof ReadableStream) {
			// If this was also a resolve `Promise`, the result type header will end
			// up as "Promise, ReadableStream"
			headers.append(CoreHeaders.OP_RESULT_TYPE, "ReadableStream");
			return new Response(result, { status, headers });
		} else {
			const stringified = await stringifyWithStreams(
				WORKERS_PLATFORM_IMPL,
				result,
				this.reducers,
				/* allowUnbufferedStream */ allowAsync
			);
			if (stringified.unbufferedStream === undefined) {
				return new Response(stringified.value, { status, headers });
			} else {
				const body = new IdentityTransformStream();
				const encodedValue = ENCODER.encode(stringified.value);
				const encodedSize = encodedValue.byteLength.toString();
				headers.set(CoreHeaders.OP_STRINGIFIED_SIZE, encodedSize);
				void this.#writeWithUnbufferedStream(
					body.writable,
					encodedValue,
					stringified.unbufferedStream
				);
				return new Response(body.readable, { status, headers });
			}
		}
	}

	async #writeWithUnbufferedStream(
		writable: WritableStream,
		encodedValue: Uint8Array,
		unbufferedStream: ReadableStream
	) {
		const writer = writable.getWriter();
		await writer.write(encodedValue);
		writer.releaseLock();
		await unbufferedStream.pipeTo(writable);
	}
}
