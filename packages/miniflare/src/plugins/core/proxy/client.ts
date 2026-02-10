/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import assert from "node:assert";
import crypto from "node:crypto";
import { ReadableStream, TransformStream } from "node:stream/web";
import util from "node:util";
import { stringify } from "devalue";
import { Headers } from "undici";
import { DispatchFetch, Request, Response } from "../../../http";
import { prefixStream, readPrefix } from "../../../shared";
import {
	Awaitable,
	CoreHeaders,
	createHTTPReducers,
	createHTTPRevivers,
	isDurableObjectStub,
	isFetcherFetch,
	isR2ObjectWriteHttpMetadata,
	parseWithReadableStreams,
	ProxyAddresses,
	ProxyOps,
	ReducersRevivers,
	StringifiedWithStream,
	stringifyWithStreams,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "../../../workers";
import { DECODER, SynchronousFetcher, SynchronousResponse } from "./fetch-sync";
import { NODE_PLATFORM_IMPL } from "./types";
import type {
	ImageDrawOptions,
	ImageOutputOptions,
	ImagesBinding,
	ImageTransform,
	ImageTransformationResult,
	ImageTransformer,
	ServiceWorkerGlobalScope,
} from "@cloudflare/workers-types/experimental";

const kAddress = Symbol("kAddress");
const kName = Symbol("kName");
const kIsFunction = Symbol("kIsFunction");
interface NativeTarget {
	// `kAddress` is used as a brand for `NativeTarget`. Pointer to the "heap"
	// map in the `ProxyServer` Durable Object.
	[kAddress]: number;
	// Use `Symbol` for name too, so we can use it as a unique property key in
	// `ProxyClientHandler`. Usually the `.constructor.name` of the object.
	[kName]: string;
	// Use `Symbol` for isFunction too, so we can use it as a unique property key in
	// `ProxyClientHandler`. This is a field needed because we need to treat functions ad-hoc.
	[kIsFunction]: boolean;
}
function isNativeTarget(value: unknown): value is NativeTarget {
	return (
		typeof value === "object" &&
		value !== null &&
		kAddress in value &&
		kIsFunction in value
	);
}

// Special targets for objects automatically added to the `ProxyServer` "heap"
const TARGET_GLOBAL: NativeTarget = {
	[kAddress]: ProxyAddresses.GLOBAL,
	[kName]: "global",
	[kIsFunction]: false,
};
const TARGET_ENV: NativeTarget = {
	[kAddress]: ProxyAddresses.ENV,
	[kName]: "env",
	[kIsFunction]: false,
};

const reducers: ReducersRevivers = {
	...structuredSerializableReducers,
	...createHTTPReducers(NODE_PLATFORM_IMPL),
	Native(value) {
		if (isNativeTarget(value))
			return [value[kAddress], value[kName], value[kIsFunction]];
	},
};
const revivers: ReducersRevivers = {
	...structuredSerializableRevivers,
	...createHTTPRevivers(NODE_PLATFORM_IMPL),
	// `Native` reviver depends on `ProxyStubHandler` methods
};

export const PROXY_SECRET = crypto.randomBytes(16);
const PROXY_SECRET_HEX = PROXY_SECRET.toString("hex");

function isClientError(status: number) {
	return 400 <= status && status < 500;
}

// Exported public API of the proxy system
export class ProxyClient {
	#bridge: ProxyClientBridge;

	constructor(runtimeEntryURL: URL, dispatchFetch: DispatchFetch) {
		this.#bridge = new ProxyClientBridge(runtimeEntryURL, dispatchFetch);
	}

	// Lazily initialise proxies as required
	#globalProxy?: ServiceWorkerGlobalScope;
	#envProxy?: Record<string, unknown>;
	get global(): ServiceWorkerGlobalScope {
		return (this.#globalProxy ??= this.#bridge.getProxy(TARGET_GLOBAL));
	}
	get env(): Record<string, unknown> {
		return (this.#envProxy ??= this.#bridge.getProxy(TARGET_ENV));
	}

	poisonProxies(): void {
		this.#bridge.poisonProxies();
		// Reset `#{global,env}Proxy` so they aren't poisoned on next access
		this.#globalProxy = undefined;
		this.#envProxy = undefined;
	}

	setRuntimeEntryURL(runtimeEntryURL: URL) {
		// This function will be called whenever the runtime restarts. The URL may
		// be different if the port has changed.
		this.#bridge.url = runtimeEntryURL;
	}

	dispose(): Promise<void> {
		// Intentionally not resetting `#{global,env}Proxy` to keep them poisoned.
		// `workerd` won't be started again by this `Miniflare` instance after
		// `dispose()` is called.
		return this.#bridge.dispose();
	}
}

interface NativeTargetHeldValue {
	address: number;
	version: number;
}

// Class containing functions that should accessible by both `ProxyClient` and
// `ProxyStubHandler`, but not exported to consumers of `ProxyClient`
class ProxyClientBridge {
	// Each proxy stub is initialised with the version stored here. Whenever
	// `poisonProxies()` is called, this version is incremented. Before the
	// proxy makes any request to `workerd`, it checks the version number here
	// matches its own internal version, and throws if not.
	#version = 0;
	// Whenever the `ProxyServer` returns a native target, it adds a strong
	// reference to the "heap" in the singleton object. This prevents the object
	// being garbage collected. To solve this, we register the native target
	// proxies on the client in a `FinalizationRegistry`. When the proxies get
	// garbage collected, we let the `ProxyServer` know it can release the strong
	// "heap" reference, as we'll never be able to access it again. Importantly,
	// we need to unregister all proxies from the registry when we poison them,
	// as the references will be invalid, and a new object with the same address
	// may be added to the "heap".
	readonly #finalizationRegistry: FinalizationRegistry<NativeTargetHeldValue>;
	// Garbage collection passes will free lots of objects at once. Rather than
	// sending a `DELETE` request for each address, we batch finalisations within
	// 100ms of each other into one request. This ensures we don't create *lots*
	// of TCP connections to `workerd` in `dispatchFetch()` for all the concurrent
	// requests.
	readonly #finalizeBatch: NativeTargetHeldValue[] = [];
	#finalizeBatchTimeout?: ReturnType<typeof setTimeout>;

	readonly sync = new SynchronousFetcher();

	constructor(
		public url: URL,
		readonly dispatchFetch: DispatchFetch
	) {
		this.#finalizationRegistry = new FinalizationRegistry(this.#finalizeProxy);
	}

	get version(): number {
		return this.#version;
	}

	#finalizeProxy = (held: NativeTargetHeldValue) => {
		// Called when the `Proxy` with address `targetAddress` gets garbage
		// collected. This removes the target from the `ProxyServer` "heap".
		this.#finalizeBatch.push(held);
		clearTimeout(this.#finalizeBatchTimeout);
		this.#finalizeBatchTimeout = setTimeout(this.#finalizeProxyBatch, 100);
	};

	#finalizeProxyBatch = async () => {
		const addresses: number[] = [];
		for (const held of this.#finalizeBatch.splice(0)) {
			// Sanity check: make sure the proxy hasn't been poisoned. We should
			// unregister all proxies from the finalisation registry when poisoning,
			// but it doesn't hurt to be careful.
			if (held.version === this.#version) addresses.push(held.address);
		}
		// If there are no addresses to free, we don't need to send a request
		if (addresses.length === 0) return;
		try {
			await this.dispatchFetch(this.url, {
				method: "DELETE",
				headers: {
					[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
					[CoreHeaders.OP]: ProxyOps.FREE,
					[CoreHeaders.OP_TARGET]: addresses.join(","),
				},
			});
		} catch {
			// Ignore network errors when freeing. If this `dispatchFetch()` throws,
			// it's likely the runtime has shutdown, so the entire "heap" has been
			// destroyed anyway. There's a small chance of a memory leak here if this
			// threw for another reason.
		}
	};

	getProxy<T extends object>(target: NativeTarget): T {
		const handler = new ProxyStubHandler(this, target);

		type WithCustomInspect<T> = T & {
			[util.inspect.custom]?: unknown;
		};
		let proxyTarget: WithCustomInspect<object | Function>;
		if (target[kIsFunction]) {
			// the proxy target needs to be a function so that the consumer of the proxy
			// can simply call it (if we didn't do this consumers would get a
			// `x is not a function` type error)
			proxyTarget = new Function();
		} else {
			proxyTarget = {};
		}
		proxyTarget[util.inspect.custom] = handler.inspect;
		const proxy = new Proxy<T>(proxyTarget as T, handler);

		const held: NativeTargetHeldValue = {
			address: target[kAddress],
			version: this.#version,
		};
		this.#finalizationRegistry.register(proxy, held, this);
		return proxy;
	}

	poisonProxies(): void {
		this.#version++;
		// This function will be called whenever `setOptions()` or `dispose()` is
		// called. We must also unregister all finalizers as the heap will be reset,
		// and we don't want a new object added with the same address to be freed
		// when it's still accessible.
		this.#finalizationRegistry.unregister(this);
	}

	dispose(): Promise<void> {
		this.poisonProxies();
		return this.sync.dispose();
	}
}

class ProxyStubHandler<T extends object>
	extends Function
	implements ProxyHandler<T>
{
	readonly #version: number;
	readonly #stringifiedTarget: string;
	readonly #knownValues = new Map<string, unknown>();
	readonly #knownDescriptors = new Map<
		string,
		PropertyDescriptor | undefined
	>();
	#knownOwnKeys?: string[];

	revivers: ReducersRevivers = {
		...revivers,
		Native: (value) => {
			assert(Array.isArray(value));
			const [address, name, isFunction] = value as unknown[];
			assert(typeof address === "number");
			assert(typeof name === "string");
			assert(typeof isFunction === "boolean");
			const target: NativeTarget = {
				[kAddress]: address,
				[kName]: name,
				[kIsFunction]: isFunction,
			};
			if (name === "Promise") {
				// We'll only see `Promise`s here if we're parsing from
				// `#parseSyncResponse`. In that case, we'll want to make an async fetch
				// to actually resolve the `Promise` and get the value.
				const resPromise = this.bridge.dispatchFetch(this.bridge.url, {
					method: "POST",
					headers: {
						[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
						[CoreHeaders.OP]: ProxyOps.GET, // GET without key just gets target
						[CoreHeaders.OP_TARGET]: stringify(target, reducers),
					},
				});
				return this.#parseAsyncResponse(resPromise);
			} else {
				// See #createMediaProxy() for why this is special
				if (name === "ImagesBindingImpl") {
					return this.#createMediaProxy(target);
				}
				// Otherwise, return a `Proxy` for this target
				return this.bridge.getProxy(target);
			}
		},
	};
	/**
	 * Images bindings are some of the most complex bindings from an API perspective, other than RPC. In particular, they expose a _synchronous_ API that accepts ReadableStream arguments.
	 * Multiple synchronous APIs are chained together in a builder pattern (e.g. `await env.IMAGES.input(stream).transform(...).output(...)`) before the final `.output()` call is awaited.
	 * This breaks our assumptions around functions that accept ReadableStream arguments always being async, and so doesn't work without some special casing.
	 *
	 * Ref: https://developers.cloudflare.com/images/transform-images/bindings/
	 */
	#createMediaProxy(target: NativeTarget) {
		type Operation = {
			type: "transform" | "draw";
			arguments: unknown[];
		};
		const transformer = (
			target: {
				input: (
					stream: ReadableStream,
					operations: Operation[],
					options: ImageOutputOptions
				) => ImageTransformationResult;
			},
			stream: ReadableStream,
			operations: Operation[]
		): ImageTransformer => {
			return {
				transform: (transform: ImageTransform): ImageTransformer => {
					return transformer(target, stream, [
						...operations,
						{ type: "transform", arguments: [transform] },
					]);
				},
				draw: (image: ImageTransformer, options?: ImageDrawOptions) => {
					return transformer(target, stream, [
						...operations,
						{ type: "draw", arguments: [image, options] },
					]);
				},
				output: async (options: ImageOutputOptions) => {
					// This signature doesn't exist on the production binding, but will be intercepted in the proxy server
					return await target.input(stream, operations, options);
				},
			};
		};
		const binding = {
			info: (stream: ReadableStream<Uint8Array>) => {
				// @ts-expect-error The stream types are mismatched
				return (this.bridge.getProxy(target) as ImagesBinding)["info"](stream);
			},
			input: (stream: ReadableStream<Uint8Array>) => {
				return transformer(this.bridge.getProxy(target), stream, []);
			},
		};
		return binding;
	}

	constructor(
		readonly bridge: ProxyClientBridge,
		readonly target: NativeTarget
	) {
		super();
		this.#version = bridge.version;
		this.#stringifiedTarget = stringify(this.target, reducers);
	}

	get #poisoned() {
		return this.#version !== this.bridge.version;
	}
	#assertSafe() {
		if (this.#poisoned) {
			throw new Error(
				"Attempted to use poisoned stub. Stubs to runtime objects must be " +
					"re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`."
			);
		}
	}

	inspect = (depth: number, options: util.InspectOptions) => {
		const details = { name: this.target[kName], poisoned: this.#poisoned };
		return `ProxyStub ${util.inspect(details, options)}`;
	};

	#maybeThrow(
		res: { status: number },
		result: unknown,
		caller: Function
	): unknown {
		if (res.status === 500) {
			if (typeof result === "object" && result !== null) {
				// Update the stack trace to include the calling location in Node
				// (as opposed to inside the proxy server) which is much more useful
				// for debugging. Specifying the original `caller` here hides our
				// internal implementation functions from the stack.
				Error.captureStackTrace(result, caller);
			}
			throw result;
		} else {
			// Returning a non-200/500 is an internal error. Note we special case
			// `Fetcher#fetch()` calls, so user can still return any status code.
			assert(res.status === 200);
			return result;
		}
	}
	async #parseAsyncResponse(resPromise: Promise<Response>): Promise<unknown> {
		const res = await resPromise;
		assert(!isClientError(res.status));

		const typeHeader = res.headers.get(CoreHeaders.OP_RESULT_TYPE);
		if (typeHeader === "Promise, ReadableStream") return res.body;
		assert(typeHeader === "Promise"); // Must be async

		let stringifiedResult: string;
		let unbufferedStream: ReadableStream | undefined;
		const stringifiedSizeHeader = res.headers.get(
			CoreHeaders.OP_STRINGIFIED_SIZE
		);
		if (stringifiedSizeHeader === null) {
			// No unbuffered stream
			stringifiedResult = await res.text();
		} else {
			// Response contains unbuffered `ReadableStream`
			const stringifiedSize = parseInt(stringifiedSizeHeader);
			assert(!Number.isNaN(stringifiedSize));
			assert(res.body !== null);
			const [buffer, rest] = await readPrefix(res.body, stringifiedSize);
			stringifiedResult = buffer.toString();
			// Need to `.pipeThrough()` here otherwise we'll get
			// `TypeError: Response body object should not be disturbed or locked`
			// when trying to construct a `Response` with the stream.
			// TODO(soon): add support for MINIFLARE_ASSERT_BODIES_CONSUMED here
			unbufferedStream = rest.pipeThrough(new TransformStream());
		}

		const result = parseWithReadableStreams(
			NODE_PLATFORM_IMPL,
			{ value: stringifiedResult, unbufferedStream },
			this.revivers
		);

		// We get an empty stack trace if we thread the caller through here,
		// specifying `this.#parseAsyncResponse` is good enough though, we just
		// get an extra `processTicksAndRejections` entry
		return this.#maybeThrow(res, result, this.#parseAsyncResponse);
	}
	#parseSyncResponse(syncRes: SynchronousResponse, caller: Function): unknown {
		assert(!isClientError(syncRes.status));
		assert(syncRes.body !== null);
		// Unbuffered streams should only be sent as part of async responses
		assert(syncRes.headers.get(CoreHeaders.OP_STRINGIFIED_SIZE) === null);
		if (syncRes.body instanceof ReadableStream) return syncRes.body;

		const stringifiedResult = DECODER.decode(syncRes.body);
		const result = parseWithReadableStreams(
			NODE_PLATFORM_IMPL,
			{ value: stringifiedResult },
			this.revivers
		);
		return this.#maybeThrow(syncRes, result, caller);
	}

	#thisFnKnownAsync = false;

	apply(_target: T, ...args: unknown[]) {
		const result = this.#call(
			"__miniflareWrappedFunction",
			this.#thisFnKnownAsync,
			args[1] as unknown[],
			this as Function
		);
		if (!this.#thisFnKnownAsync && result instanceof Promise) {
			this.#thisFnKnownAsync = true;
		}
		return result;
	}

	get(_target: T, key: string | symbol, _receiver: unknown) {
		this.#assertSafe();

		// When `devalue` `stringify`ing `Proxy`, treat it as a `NativeTarget`
		// (allows native proxies to be used as arguments, e.g. `DurableObjectId`s)
		if (key === kAddress) return this.target[kAddress];
		if (key === kName) return this.target[kName];
		if (key === kIsFunction) return this.target[kIsFunction];
		// Ignore all other symbol properties, or `then()`s. We should never return
		// `Promise`s or thenables as native targets, and want to avoid the extra
		// network call when `await`ing the proxy.
		if (typeof key === "symbol" || key === "then") return undefined;

		// See optimisation comments below for cases where this will be set
		const maybeKnown = this.#knownValues.get(key);
		if (maybeKnown !== undefined) return maybeKnown;

		// Always perform a synchronous GET, if this returns a `Promise`, we'll
		// do an asynchronous GET in the reviver
		const syncRes = this.bridge.sync.fetch(this.bridge.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.GET,
				[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
				[CoreHeaders.OP_KEY]: key,
			},
		});
		let result: unknown;
		if (syncRes.headers.get(CoreHeaders.OP_RESULT_TYPE) === "Function") {
			result = this.#createFunction(key);
		} else {
			result = this.#parseSyncResponse(syncRes, this.get);
		}

		if (
			// Optimisation: if this property is a function, we assume constant
			// prototypes of proxied objects, so it's never going to change
			typeof result === "function" ||
			// Optimisation: if this property is a reference, we assume it's never
			// going to change. This allows us to reuse the known cache of nested
			// objects on multiple access (e.g. reusing `env["...<bucket>"]` proxy if
			// `getR2Bucket(<bucket>)` is called on the same bucket multiple times).
			isNativeTarget(result) ||
			// Once a `ReadableStream` sent across proxy, we won't be able to read it
			// again in the server, so reuse the same stream for future accesses
			// (e.g. accessing `R2ObjectBody#body` multiple times)
			result instanceof ReadableStream
		) {
			this.#knownValues.set(key, result);
		}
		return result;
	}

	has(target: T, key: string | symbol) {
		// Not technically correct, but a close enough approximation for `in`
		return this.get(target, key, undefined) !== undefined;
	}

	getOwnPropertyDescriptor(target: T, key: string | symbol) {
		this.#assertSafe();

		if (typeof key === "symbol") return undefined;

		// Optimisation: assume constant prototypes of proxied objects, descriptors
		// should never change after we've fetched them
		const maybeKnown = this.#knownDescriptors.get(key);
		if (maybeKnown !== undefined) return maybeKnown;

		const syncRes = this.bridge.sync.fetch(this.bridge.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.GET_OWN_DESCRIPTOR,
				[CoreHeaders.OP_KEY]: key,
				[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
			},
		});
		const result = this.#parseSyncResponse(
			syncRes,
			this.getOwnPropertyDescriptor
		) as PropertyDescriptor | undefined;

		this.#knownDescriptors.set(key, result);
		return result;
	}

	ownKeys(_target: T) {
		this.#assertSafe();

		// Optimisation: assume constant prototypes of proxied objects, own keys
		// should never change after we've fetched them
		if (this.#knownOwnKeys !== undefined) return this.#knownOwnKeys;

		const syncRes = this.bridge.sync.fetch(this.bridge.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.GET_OWN_KEYS,
				[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
			},
		});
		const result = this.#parseSyncResponse(syncRes, this.ownKeys) as string[];

		this.#knownOwnKeys = result;
		return result;
	}

	getPrototypeOf(_target: T) {
		this.#assertSafe();

		// Return a `null` prototype, so users know this isn't a plain object
		return null;
	}

	#createFunction(key: string) {
		// Optimisation: if the function returns a `Promise`, we know it must be
		// async (assuming all async functions always return `Promise`s). When
		// combined with the optimisation to cache known methods, this allows us to
		// perform a single async network call per invocation as opposed to three:
		// 1) Synchronously get method
		// 2) Synchronously call method returning `Promise`
		// 3) Asynchronously resolve returned `Promise`
		let knownAsync = false;
		// `{ [key]: () => {} }[key]` evaluates to a function named `key` as opposed
		// to `(anonymous)`. This is useful for debugging, as logging the function
		// will include the name.
		const func = {
			[key]: (...args: unknown[]) => {
				const result = this.#call(key, knownAsync, args, func);
				if (!knownAsync && result instanceof Promise) knownAsync = true;
				return result;
			},
		}[key];
		return func;
	}
	#call(
		key: string,
		knownAsync: boolean,
		args: unknown[],
		caller: Function
	): unknown {
		this.#assertSafe();

		const targetName = this.target[kName];
		// See `isFetcherFetch()` comment for why this is special
		if (isFetcherFetch(targetName, key)) return this.#fetcherFetchCall(args);

		const stringified = stringifyWithStreams(
			NODE_PLATFORM_IMPL,
			args,
			reducers,
			/* allowUnbufferedStream */ true
		);
		if (
			knownAsync ||
			// Durable Object stub RPC calls should always be async to avoid blocking
			// the Node.js event loop with `Atomics.wait()`. This allows Promise.race()
			// and timeouts to work correctly when racing against DO method calls.
			isDurableObjectStub(targetName) ||
			// We assume every call with `ReadableStream`/`Blob` arguments is async.
			// Note that you can't consume `ReadableStream`/`Blob` synchronously: if
			// you tried a similar trick to `SynchronousFetcher`, blocking the main
			// thread with `Atomics.wait()` would prevent chunks being read. This
			// assumption doesn't hold for `Blob`s and `FormData#{append,set}()`, but
			// we should never expose proxies for those APIs to users.
			stringified instanceof Promise || // (instanceof Promise if buffered `ReadableStream`/`Blob`s)
			stringified.unbufferedStream !== undefined // (if at least one `ReadableStream` passed)
		) {
			return this.#asyncCall(key, stringified);
		} else {
			const result = this.#syncCall(key, stringified.value, caller);
			// See `isR2ObjectWriteHttpMetadata()` comment for why this special
			if (isR2ObjectWriteHttpMetadata(targetName, key)) {
				const arg = args[0];
				assert(arg instanceof Headers);
				assert(result instanceof Headers);
				for (const [key, value] of result) arg.set(key, value);
				return; // void
			}
			return result;
		}
	}
	#syncCall(key: string, stringifiedValue: string, caller: Function): unknown {
		const argsSize = Buffer.byteLength(stringifiedValue).toString();
		const syncRes = this.bridge.sync.fetch(this.bridge.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.CALL,
				[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
				[CoreHeaders.OP_KEY]: key,
				[CoreHeaders.OP_STRINGIFIED_SIZE]: argsSize,
				"Content-Length": argsSize,
			},
			body: stringifiedValue,
		});
		return this.#parseSyncResponse(syncRes, caller);
	}
	async #asyncCall(
		key: string,
		stringifiedAwaitable: Awaitable<StringifiedWithStream<ReadableStream>>
	): Promise<unknown> {
		const stringified = await stringifiedAwaitable;

		let resPromise: Promise<Response>;
		if (stringified.unbufferedStream === undefined) {
			const argsSize = Buffer.byteLength(stringified.value).toString();
			resPromise = this.bridge.dispatchFetch(this.bridge.url, {
				method: "POST",
				headers: {
					[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
					[CoreHeaders.OP]: ProxyOps.CALL,
					[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
					[CoreHeaders.OP_KEY]: key,
					[CoreHeaders.OP_STRINGIFIED_SIZE]: argsSize,
					"Content-Length": argsSize,
				},
				body: stringified.value,
			});
		} else {
			const encodedArgs = Buffer.from(stringified.value);
			const argsSize = encodedArgs.byteLength.toString();
			const body = prefixStream(encodedArgs, stringified.unbufferedStream);
			resPromise = this.bridge.dispatchFetch(this.bridge.url, {
				method: "POST",
				headers: {
					[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
					[CoreHeaders.OP]: ProxyOps.CALL,
					[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
					[CoreHeaders.OP_KEY]: key,
					[CoreHeaders.OP_STRINGIFIED_SIZE]: argsSize,
				},
				duplex: "half",
				body,
			});
		}

		return this.#parseAsyncResponse(resPromise);
	}
	#fetcherFetchCall(args: unknown[]) {
		// @ts-expect-error `...args` isn't type-safe here, but `undici` should
		//  validate types at runtime, and throw appropriate errors
		const request = new Request(...args);
		// If adding new headers here, remember to `delete()` them in `ProxyServer`
		// before calling `fetch()`.
		request.headers.set(CoreHeaders.OP_SECRET, PROXY_SECRET_HEX);
		request.headers.set(CoreHeaders.OP, ProxyOps.CALL);
		request.headers.set(CoreHeaders.OP_TARGET, this.#stringifiedTarget);
		request.headers.set(CoreHeaders.OP_KEY, "fetch");
		return this.bridge.dispatchFetch(request);
	}
}
