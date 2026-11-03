import assert from "node:assert";
import { Buffer } from "node:buffer";
import { newWorkersWebSocketRpcResponse, RpcTarget } from "capnweb";
import * as workers from "cloudflare:workers";
import { parse } from "devalue";
import { readPrefix, reduceError } from "miniflare:shared";
import {
	CoreBindings,
	CoreHeaders,
	isFetcherFetch,
	isImagesInput,
	isR2ObjectWriteHttpMetadata,
	PROXY_ERROR_NAME_KEY,
	ProxyAddresses,
	ProxyOps,
} from "./constants";
import {
	__MiniflareFunctionWrapper,
	createHTTPReducers,
	createHTTPRevivers,
	parseWithReadableStreams,
	stringifyWithStreams,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "./devalue";
import type { ProxyRpcApi } from "./constants";
import type { PlatformImpl, ReducersRevivers } from "./devalue";

// Not all of these are declared by `@cloudflare/workers-types`
const { RpcPromise, RpcProperty, RpcStub, ServiceStub } =
	workers as unknown as Record<
		"RpcPromise" | "RpcProperty" | "RpcStub" | "ServiceStub",
		abstract new (...args: never[]) => object
	>;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const ALLOWED_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];
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

/**
 * @param value Object about to be stored on the "heap"
 * @returns Name of `value`'s class. Read from its prototype, as accessing any
 * property of a Workers RPC stub (e.g. `name` or `constructor`) calls the
 * remote object.
 */
function getClassName(value: object): string {
	return Object.getPrototypeOf(value)?.constructor?.name ?? "Object";
}

/**
 * @param value Value about to be stored on the "heap"
 * @returns Whether `value` speaks Workers RPC, so should be used by the client
 * through a Cap'n Web stub rather than a native "heap" object proxy
 */
function isRpc(value: unknown): boolean {
	if (typeof value === "function") {
		return true;
	}
	if (!isObject(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return (
		value instanceof ServiceStub ||
		value instanceof RpcTarget ||
		proto === RpcStub.prototype ||
		proto === RpcPromise.prototype ||
		proto === RpcProperty.prototype
	);
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
				assert(value !== null);
				const name = getClassName(value as object);
				if (value instanceof __MiniflareFunctionWrapper) {
					// Store the function itself, so it can be used as a Cap'n Web stub
					value = (value as { __miniflareWrappedFunction: unknown })
						.__miniflareWrappedFunction;
				}
				const address = this.nextHeapAddress++;
				this.heap.set(address, value);
				return [address, name, isRpc(value)];
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
			if (heapValue instanceof Promise) {
				this.heap.delete(address);
			}
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
		if (hostHeader == null) {
			return new Response(null, { status: 400 });
		}
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
		if (secretHex == null) {
			return new Response(null, { status: 401 });
		}
		const expectedSecret = this.env[CoreBindings.DATA_PROXY_SECRET];
		const secretBuffer = Buffer.from(secretHex, "hex");
		if (
			secretBuffer.byteLength !== expectedSecret.byteLength ||
			!crypto.subtle.timingSafeEqual(secretBuffer, expectedSecret)
		) {
			return new Response(null, { status: 401 });
		}

		const opHeader = request.headers.get(CoreHeaders.OP);
		if (opHeader === ProxyOps.CONNECT) {
			return newWorkersWebSocketRpcResponse(request, new ProxyRpc(this.heap), {
				onSendError(error) {
					if (BUILT_IN_ERROR_NAMES.has(error.name)) {
						return;
					}
					// Copy the error rather than mutating it, as it may be sent again
					const copy = Object.assign(new Error(error.message), error, {
						[PROXY_ERROR_NAME_KEY]: error.name,
					});
					if ("cause" in error) {
						copy.cause = error.cause;
					}
					// Omit our stack, the client replaces it with the caller's
					copy.stack = undefined;
					return copy;
				},
			});
		}
		const targetHeader = request.headers.get(CoreHeaders.OP_TARGET);
		const keyHeader = request.headers.get(CoreHeaders.OP_KEY);
		const allowAsync = request.headers.get(CoreHeaders.OP_SYNC) === null;
		const argsSizeHeader = request.headers.get(CoreHeaders.OP_STRINGIFIED_SIZE);
		const contentLengthHeader = request.headers.get("Content-Length");

		// Get target to perform operations on
		if (targetHeader === null) {
			return new Response(null, { status: 400 });
		}

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

			if (typeof result === "function") {
				// Calling functions-which-return-functions not yet supported
				return new Response(null, {
					status: 204,
					headers: { [CoreHeaders.OP_RESULT_TYPE]: "Function" },
				});
			}
		} else if (opHeader === ProxyOps.GET_OWN_DESCRIPTOR) {
			if (keyHeader === null) {
				return new Response(null, { status: 400 });
			}
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
				const originalUrl =
					request.headers.get(CoreHeaders.OP_ORIGINAL_URL) ??
					request.headers.get(CoreHeaders.ORIGINAL_URL);
				const url = new URL(originalUrl ?? request.url);
				// Create a new request to allow header mutation and use original URL
				request = new Request(url, request);
				request.headers.delete(CoreHeaders.OP_SECRET);
				request.headers.delete(CoreHeaders.OP);
				request.headers.delete(CoreHeaders.OP_TARGET);
				request.headers.delete(CoreHeaders.OP_KEY);
				request.headers.delete(CoreHeaders.OP_ORIGINAL_URL);
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
				// If the client sent the stream's length, restore it on the rest of
				// the request body, as some APIs (e.g. `R2Bucket#put()`) reject
				// streams without one.
				const streamSizeHeader = request.headers.get(
					CoreHeaders.OP_STREAM_SIZE
				);
				let restTransform: IdentityTransformStream | undefined;
				if (streamSizeHeader !== null) {
					const streamSize = parseInt(streamSizeHeader);
					assert(!Number.isNaN(streamSize));
					restTransform = new FixedLengthStream(streamSize);
				}
				const [encodedArgs, rest] = await readPrefix(
					request.body,
					argsSize,
					restTransform
				);
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
				// See #createMediaProxy() for why this is special
				if (isImagesInput(targetName, keyHeader)) {
					let transform = func.apply(target, [args[0]]);
					for (const operation of args[1]) {
						transform = transform[operation.type](...operation.arguments);
					}
					// We intentionally don't await this `output()` call so that it's treated as a regular promise
					result = transform.output(args[2]);
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

/**
 * Cap'n Web main interface, used to get stubs for "heap" objects that speak
 * Workers RPC. Calls on these are then forwarded by Cap'n Web.
 */
class ProxyRpc extends RpcTarget implements ProxyRpcApi {
	readonly #heap: Map<number, unknown>;

	constructor(heap: Map<number, unknown>) {
		super();
		this.#heap = heap;
	}

	stub(address: number): unknown {
		assert(this.#heap.has(address), "Attempted to use freed proxy");
		return this.#heap.get(address);
	}
}
