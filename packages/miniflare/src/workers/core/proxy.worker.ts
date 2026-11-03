import assert from "node:assert";
import { Buffer } from "node:buffer";
import { newWorkersWebSocketRpcResponse, RpcTarget } from "capnweb";
import * as workers from "cloudflare:workers";
import { parse } from "devalue";
import { reduceError } from "miniflare:shared";
import {
	CoreBindings,
	CoreHeaders,
	isFetcherFetch,
	isImagesInput,
	isProxyEncoded,
	isR2ObjectWriteHttpMetadata,
	PROXY_ENCODED_KEY,
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
import type { ProxyEncoded, ProxyRpcApi } from "./constants";
import type { PlatformImpl, ReducersRevivers } from "./devalue";

// Not all of these are declared by `@cloudflare/workers-types`
const { RpcPromise, RpcProperty, RpcStub, ServiceStub } =
	workers as unknown as Record<
		"RpcPromise" | "RpcProperty" | "RpcStub" | "ServiceStub",
		abstract new (...args: never[]) => object
	>;

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
	if (isObject(value) && getClassName(value) === "RpcStub") {
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
 * through a Cap'n Web stub rather than as a native "heap" object
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

/**
 * @param value Value returned to the client over Cap'n Web
 * @returns Whether Cap'n Web can serialise `value` itself
 */
function isCapnWebSerializable(value: object): boolean {
	return (
		value instanceof Date ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		value instanceof Error ||
		value instanceof ReadableStream ||
		value instanceof WritableStream ||
		value instanceof URL ||
		value instanceof Headers ||
		value instanceof Request ||
		value instanceof Response ||
		// Cap'n Web only accepts exact `Blob`s, `File`s are encoded separately
		(value instanceof Blob && !(value instanceof File))
	);
}

function encoded(type: string, ...data: unknown[]): ProxyEncoded {
	return { [PROXY_ENCODED_KEY]: [type, ...data] };
}

// Cap'n Web drops keys like `constructor` to prevent prototype pollution
function hasPrototypeKey(value: object): boolean {
	return Object.keys(value).some((key) => key in Object.prototype);
}

const BYTES_CONSTRUCTORS: Record<string, new (buffer: ArrayBuffer) => unknown> =
	{
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
	};

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
				return [this.store(value), name, isRpc(value)];
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

	store(value: unknown): number {
		const address = this.nextHeapAddress++;
		this.heap.set(address, value);
		return address;
	}

	/**
	 * Replaces values in a result Cap'n Web can't serialise with
	 * {@link ProxyEncoded} values, storing native objects on the "heap".
	 *
	 * @param value Result about to be returned over Cap'n Web
	 * @returns Value Cap'n Web can serialise
	 */
	encode(value: unknown): unknown {
		if (typeof value === "function") {
			return encoded("Handle", this.store(value), getClassName(value), true);
		}
		if (!isObject(value) || isCapnWebSerializable(value)) {
			return value;
		}
		if (value instanceof File) {
			return encoded(
				"File",
				value.slice(0, value.size, value.type),
				value.name,
				value.lastModified
			);
		}
		if (value instanceof Map) {
			return encoded(
				"Map",
				Array.from(value, ([k, v]) => [this.encode(k), this.encode(v)])
			);
		}
		if (value instanceof Set) {
			return encoded(
				"Set",
				Array.from(value, (v) => this.encode(v))
			);
		}
		if (value instanceof RegExp) {
			return encoded("RegExp", value.source, value.flags);
		}
		if (Array.isArray(value)) {
			return value.map((v) => this.encode(v));
		}
		if (isPlainObject(value)) {
			if (hasPrototypeKey(value)) {
				return encoded(
					"Object",
					Object.entries(value).map(([k, v]) => [k, this.encode(v)])
				);
			}
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = this.encode(v);
			}
			return result;
		}
		return encoded(
			"Handle",
			this.store(value),
			getClassName(value),
			isRpc(value)
		);
	}

	/**
	 * Revives {@link ProxyEncoded} values in arguments sent by the client.
	 *
	 * @param value Argument received over Cap'n Web
	 * @returns Value to pass to the target method
	 */
	async decode(value: unknown): Promise<unknown> {
		if (isProxyEncoded(value)) {
			const [type, ...data] = value[PROXY_ENCODED_KEY];
			switch (type) {
				case "Handle": {
					const [address] = data;
					assert(typeof address === "number");
					assert(this.heap.has(address));
					return this.heap.get(address);
				}
				case "Map":
					return new Map(
						await Promise.all(
							(data[0] as [unknown, unknown][]).map(
								async ([k, v]): Promise<[unknown, unknown]> => [
									await this.decode(k),
									await this.decode(v),
								]
							)
						)
					);
				case "Set":
					return new Set(
						await Promise.all((data[0] as unknown[]).map((v) => this.decode(v)))
					);
				case "Object": {
					const result = {};
					for (const [k, v] of data[0] as [string, unknown][]) {
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
				case "RegExp":
					return new RegExp(data[0] as string, data[1] as string);
				case "File": {
					const [blob, name, lastModified] = data as [Blob, string, number];
					return new File([blob], name, { type: blob.type, lastModified });
				}
				case "Stream": {
					const [stream, length] = data as [ReadableStream, number];
					return stream.pipeThrough(new FixedLengthStream(length));
				}
				case "String":
					return new Response(data[0] as ReadableStream).text();
				case "Bytes": {
					const [stream, bytesType] = data as [ReadableStream, string];
					const buffer = await new Response(stream).arrayBuffer();
					if (bytesType === "ArrayBuffer") {
						return buffer;
					}
					const BytesConstructor = BYTES_CONSTRUCTORS[bytesType];
					assert(BytesConstructor !== undefined);
					return new BytesConstructor(buffer);
				}
			}
			assert.fail(`Unexpected encoded value type: ${type}`);
		}
		if (Array.isArray(value)) {
			return Promise.all(value.map((v) => this.decode(v)));
		}
		if (isObject(value) && Object.getPrototypeOf(value) === Object.prototype) {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = await this.decode(v);
			}
			return result;
		}
		return value;
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
			return newWorkersWebSocketRpcResponse(request, new ProxyRpc(this), {
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

		// Every other operation is synchronous: the client is blocking its thread
		// until we respond, so `Promise`s are returned as "heap" references
		// rather than awaited
		const targetHeader = request.headers.get(CoreHeaders.OP_TARGET);
		const keyHeader = request.headers.get(CoreHeaders.OP_KEY);

		// Get target to perform operations on
		if (targetHeader === null) {
			return new Response(null, { status: 400 });
		}

		// Revive the target from the heap
		const target: Record<string, unknown> = parse(
			targetHeader,
			this.nativeReviver
		);
		const targetName = target.constructor.name;

		let status = 200;
		let result: unknown;
		if (opHeader === ProxyOps.GET) {
			if (keyHeader === null) {
				return new Response(null, { status: 400 });
			}
			result = target[keyHeader];
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

			const args = parseWithReadableStreams(
				WORKERS_PLATFORM_IMPL,
				{ value: await request.text() },
				this.revivers
			);
			assert(Array.isArray(args));
			try {
				result = func.apply(target, args);
				// Workers RPC thenables (e.g. `RpcPromise`) can't be stored on the
				// "heap" as `Promise`s, which the client knows to resolve
				if (
					isObject(result) &&
					!(result instanceof Promise) &&
					typeof result.then === "function"
				) {
					result = Promise.resolve(result);
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

		if (result instanceof ReadableStream) {
			return new Response(result, {
				status,
				headers: { [CoreHeaders.OP_RESULT_TYPE]: "ReadableStream" },
			});
		}
		const stringified = await stringifyWithStreams(
			WORKERS_PLATFORM_IMPL,
			result,
			this.reducers,
			/* allowUnbufferedStream */ false
		);
		return new Response(stringified.value, { status });
	}
}

/**
 * Cap'n Web main interface for asynchronous operations on "heap" objects.
 * Holds `ProxyServer` in a private field so it isn't exposed over RPC.
 */
class ProxyRpc extends RpcTarget implements ProxyRpcApi {
	readonly #server: ProxyServer;

	constructor(server: ProxyServer) {
		super();
		this.#server = server;
	}

	stub(address: number): unknown {
		const heap = this.#server.heap;
		assert(heap.has(address), "Attempted to use freed proxy");
		return heap.get(address);
	}

	async resolve(address: number): Promise<unknown> {
		const heap = this.#server.heap;
		const promise = heap.get(address);
		assert(promise instanceof Promise);
		// Clients only resolve each `Promise` once
		heap.delete(address);
		return this.#server.encode(await promise);
	}

	async call(address: number, key: string, args: unknown[]): Promise<unknown> {
		const server = this.#server;
		const target = server.heap.get(address) as Record<string, unknown>;
		assert(target !== undefined, "Attempted to use freed proxy");
		const func = target[key];
		assert(typeof func === "function");
		const decodedArgs = (await server.decode(args)) as unknown[];

		let result: unknown;
		// See #createMediaProxy() for why this is special
		if (isImagesInput(target.constructor.name, key)) {
			let transform = func.apply(target, [decodedArgs[0]]);
			for (const operation of decodedArgs[1] as {
				type: string;
				arguments: unknown[];
			}[]) {
				transform = transform[operation.type](...operation.arguments);
			}
			result = transform.output(decodedArgs[2]);
		} else {
			result = func.apply(target, decodedArgs);
		}
		return server.encode(await result);
	}

	free(addresses: number[]): void {
		for (const address of addresses) {
			this.#server.heap.delete(address);
		}
	}
}
