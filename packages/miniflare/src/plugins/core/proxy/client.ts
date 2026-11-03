/* eslint-disable @typescript-eslint/no-unsafe-function-type -- Proxy client uses Function type for dynamic RPC method proxying */
import assert from "node:assert";
import crypto from "node:crypto";
import { ReadableStream, TransformStream } from "node:stream/web";
import util from "node:util";
import { newWebSocketRpcSession, RpcStub } from "capnweb";
import { stringify } from "devalue";
import { Agent, WebSocket } from "undici";
import { Request } from "../../../http";
import { prefixStream, readPrefix } from "../../../shared";
import {
	CoreHeaders,
	CorePaths,
	createHTTPReducers,
	createHTTPRevivers,
	isDurableObjectStub,
	isFetcherFetch,
	isHeadersLike,
	isR2ObjectWriteHttpMetadata,
	isRequestLike,
	isResponseLike,
	parseWithReadableStreams,
	PROXY_ERROR_NAME_KEY,
	ProxyAddresses,
	ProxyOps,
	stringifyWithStreams,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "../../../workers";
import { DECODER, SynchronousFetcher } from "./fetch-sync";
import { NODE_PLATFORM_IMPL } from "./types";
import type { DispatchFetch, RequestInit, Response } from "../../../http";
import type {
	Awaitable,
	ProxyRpcApi,
	ReducersRevivers,
	StringifiedWithStream,
} from "../../../workers";
import type { SynchronousResponse } from "./fetch-sync";
import type {
	ImageDrawOptions,
	ImageOutputOptions,
	ImagesBinding,
	ImageTransform,
	ImageTransformationResult,
	ImageTransformer,
	ServiceWorkerGlobalScope,
} from "@cloudflare/workers-types/experimental";
import type { RpcPromise } from "capnweb";

const kAddress = Symbol("kAddress");
const kName = Symbol("kName");
// Registered globally, unlike the symbols above, as streams may be passed
// between proxies created by different loaded copies of Miniflare (e.g. the
// Vitest plugin and Wrangler resolving separate installs), which would
// otherwise each have their own distinct symbol and never see the length.
const kStreamLength: unique symbol = Symbol.for("miniflare.kStreamLength");
interface LengthTrackedStream extends ReadableStream {
	[kStreamLength]?: number;
}
interface NativeTarget {
	// `kAddress` is used as a brand for `NativeTarget`. Pointer to the "heap"
	// map in the `ProxyServer` Durable Object.
	[kAddress]: number;
	// Use `Symbol` for name too, so we can use it as a unique property key in
	// `ProxyClientHandler`. Usually the `.constructor.name` of the object.
	[kName]: string;
}

function isNativeTarget(value: unknown): value is NativeTarget {
	return typeof value === "object" && value !== null && kAddress in value;
}

// Special targets for objects automatically added to the `ProxyServer` "heap"
const TARGET_GLOBAL: NativeTarget = {
	[kAddress]: ProxyAddresses.GLOBAL,
	[kName]: "global",
};
const TARGET_ENV: NativeTarget = {
	[kAddress]: ProxyAddresses.ENV,
	[kName]: "env",
};

const reducers: ReducersRevivers = {
	...structuredSerializableReducers,
	...createHTTPReducers(NODE_PLATFORM_IMPL),
	Native(value) {
		if (isNativeTarget(value)) {
			return [value[kAddress], value[kName]];
		}
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

// `workerd` closes WebSockets receiving messages over 32 MiB, ending the
// session and breaking every stub, so calls with more data than this are
// rejected before they're sent
const MAX_INLINE_SIZE = 31 * 1024 * 1024; // 31 MiB, leaving room for the rest

function poisonedError() {
	return new Error(
		"Attempted to use poisoned stub. Stubs to runtime objects must be " +
			"re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`."
	);
}

/**
 * Restores error names Cap'n Web can't revive itself (see
 * `PROXY_ERROR_NAME_KEY`).
 *
 * @param error Value thrown by, or returned over, Cap'n Web
 */
function restoreErrorName(error: unknown) {
	if (!(error instanceof Error)) {
		return;
	}
	if (PROXY_ERROR_NAME_KEY in error) {
		const record = error as unknown as Record<string, unknown>;
		const name = record[PROXY_ERROR_NAME_KEY];
		delete record[PROXY_ERROR_NAME_KEY];
		if (typeof name === "string") {
			error.name = name;
		}
	}
	restoreErrorName(error.cause);
}

/**
 * Converts `Headers`, `Request`s and `Response`s from other implementations
 * (e.g. Miniflare's `undici` classes) to Node's globals, the only ones Cap'n Web
 * can serialise.
 *
 * @param value Argument about to be sent over Cap'n Web
 * @returns Equivalent global instance, or `undefined` if `value` isn't one of
 * these types or is already global
 */
function toGlobalHTTPObject(value: object): object | undefined {
	if (
		value instanceof globalThis.Headers ||
		value instanceof globalThis.Request ||
		value instanceof globalThis.Response
	) {
		return;
	}
	if (isHeadersLike(value)) {
		return new globalThis.Headers([...value.entries()]);
	}
	if (isRequestLike(value)) {
		return new globalThis.Request(value.url, {
			method: value.method,
			headers: [...value.headers.entries()],
			body: value.body as globalThis.ReadableStream | null,
			redirect: value.redirect as globalThis.RequestInit["redirect"],
			duplex: value.body === null ? undefined : "half",
		});
	}
	if (isResponseLike(value)) {
		return new globalThis.Response(
			value.body as globalThis.ReadableStream | null,
			{
				status: value.status,
				statusText: value.statusText,
				headers: [...value.headers.entries()],
			}
		);
	}
}

// Cap'n Web stub for `ProxyServer`'s main interface. `stub()` returns an
// `RpcPromise`, so calls can be pipelined on the result without awaiting it.
type ProxyRpcStub = {
	[K in keyof ProxyRpcApi]: (
		...args: Parameters<ProxyRpcApi[K]>
	) => RpcPromise<unknown>;
} & Disposable;

// Cap'n Web session with `ProxyServer`, used for objects that speak Workers RPC
class ProxyRpcSession {
	readonly api: ProxyRpcStub;
	// Use `undici`'s `WebSocket` with our own dispatcher, rather than `ws` or
	// the global `WebSocket`, so request mocking libraries (e.g. MSW) don't
	// intercept the connection
	readonly #dispatcher: Agent;
	readonly #webSocket: WebSocket;
	#closed = false;

	constructor(url: URL) {
		const webSocketUrl = new URL(url);
		webSocketUrl.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		this.#dispatcher = new Agent({
			connect: { rejectUnauthorized: false },
			// We trust `ProxyServer`, so allow results as large as Node can handle
			webSocket: { maxPayloadSize: 0 },
		});
		this.#webSocket = new WebSocket(webSocketUrl, {
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.CONNECT,
			},
			dispatcher: this.#dispatcher,
		});
		this.api = newWebSocketRpcSession(
			this.#webSocket as unknown as globalThis.WebSocket,
			undefined,
			{ limits: { maxMessageSize: Infinity } }
		) as unknown as ProxyRpcStub;
		// Cap'n Web queues calls until the WebSocket opens, and listens for
		// "error"s to reject them
		this.#webSocket.addEventListener("close", () => (this.#closed = true), {
			once: true,
		});
	}

	get closed(): boolean {
		return this.#closed;
	}

	dispose(): void {
		this.#closed = true;
		this.api[Symbol.dispose]();
		void this.#dispatcher.destroy().catch(() => {});
	}
}

// Exported public API of the proxy system
export class ProxyClient {
	#bridge: ProxyClientBridge;

	constructor(runtimeEntryURL: URL, dispatchFetch: DispatchFetch) {
		this.#bridge = new ProxyClientBridge(
			new URL(CorePaths.PLATFORM_PROXY, runtimeEntryURL),
			dispatchFetch
		);
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

	/**
	 * Resolves once synchronous proxy calls can be served without blocking the
	 * main thread on worker startup.
	 */
	warm(): Promise<void> {
		return this.#bridge.sync.warm();
	}

	setRuntimeEntryURL(runtimeEntryURL: URL) {
		// This function will be called whenever the runtime restarts. The URL may
		// be different if the port has changed.
		this.#bridge.url = new URL(CorePaths.PLATFORM_PROXY, runtimeEntryURL);
	}

	dispose(): Promise<void> {
		// Intentionally not resetting `#{global,env}Proxy` to keep them poisoned.
		// `workerd` won't be started again by this `Miniflare` instance after
		// `dispose()` is called.
		return this.#bridge.dispose();
	}
}

interface NativeTargetHeldValue {
	// "Heap" address, if this is a proxy for a "heap" object
	address?: number;
	version: number;
	// Cap'n Web stub to release
	stub?: Disposable;
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
	// Cap'n Web session, used for objects that speak Workers RPC
	#session?: ProxyRpcSession;

	// Underlying Cap'n Web stubs for proxies, used when sending them as
	// arguments
	readonly #rpcProxies = new WeakMap<
		object,
		{ raw: object; version: number }
	>();

	constructor(
		public url: URL,
		readonly dispatchFetch: DispatchFetch
	) {
		this.#finalizationRegistry = new FinalizationRegistry(this.#finalizeProxy);
	}

	get version(): number {
		return this.#version;
	}

	get rpc(): ProxyRpcStub {
		if (this.#session === undefined || this.#session.closed) {
			this.#session = new ProxyRpcSession(this.url);
		}
		return this.#session.api;
	}

	/**
	 * Records the `Content-Length` of a stream returned by the `ProxyServer`,
	 * so it can be restored if the same stream is passed back in.
	 *
	 * @param stream Stream returned to the caller of a proxied method
	 * @param headers Headers of the response `stream` was read from
	 */
	trackStreamLength(
		stream: ReadableStream,
		headers: { get(name: string): string | null }
	): void {
		const contentLength = headers.get("Content-Length");
		if (contentLength === null) {
			return;
		}
		const length = parseInt(contentLength);
		if (!Number.isNaN(length)) {
			(stream as LengthTrackedStream)[kStreamLength] = length;
		}
	}

	/**
	 * @param stream Stream about to be sent as a proxied call argument
	 * @returns The length recorded by `trackStreamLength()` for this exact
	 * stream object, or `undefined` if it wasn't returned by the `ProxyServer`
	 * or had no known length
	 */
	getStreamLength(stream: ReadableStream): number | undefined {
		return (stream as LengthTrackedStream)[kStreamLength];
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
			if (held.version === this.#version) {
				if (held.address !== undefined) {
					addresses.push(held.address);
				}
				held.stub?.[Symbol.dispose]();
			}
		}
		// If there are no addresses to free, we don't need to send a request
		if (addresses.length === 0) {
			return;
		}
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
		const proxyTarget: WithCustomInspect<object> = {};
		proxyTarget[util.inspect.custom] = handler.inspect;
		const proxy = new Proxy<T>(proxyTarget as T, handler);

		this.#register(proxy, target[kAddress]);
		return proxy;
	}

	#register(proxy: object, address?: number, stub?: Disposable) {
		const held: NativeTargetHeldValue = {
			address,
			version: this.#version,
			stub,
		};
		this.#finalizationRegistry.register(proxy, held, this);
	}

	/**
	 * Creates a proxy for a "heap" object that speaks Workers RPC (e.g. a
	 * service binding or Durable Object stub).
	 *
	 * @param target Native target for the "heap" object
	 */
	createHeapRpcProxy(target: NativeTarget): object {
		// Cap'n Web pipelines calls on the returned `RpcPromise`, so we can use it
		// immediately, without waiting for a round trip
		const stub = this.rpc.stub(target[kAddress]);
		const proxy = this.createRpcProxy(stub, target);
		this.#register(proxy, target[kAddress], stub);
		return proxy;
	}

	/**
	 * Wraps a Cap'n Web stub or promise, so it can be used like a Workers RPC
	 * stub returned by the rest of the proxy.
	 *
	 * @param raw Cap'n Web `RpcStub` or `RpcPromise`
	 * @param target Native target if `raw` is for a "heap" object
	 * @param isPromise Whether `raw` should be thenable
	 * @param parent Proxy `raw` was derived from, which must outlive it, as it
	 * releases the stub `raw` depends on when garbage collected
	 */
	createRpcProxy(
		raw: object,
		target?: NativeTarget,
		isPromise = false,
		parent?: object
	): object {
		const handler = new RpcProxyHandler(this, raw, target, isPromise, parent);
		// Cap'n Web stubs are callable, so this must be too
		const proxyTarget: { (): void; [util.inspect.custom]?: unknown } = () => {};
		// `util.inspect()` inspects the target directly, rather than the `Proxy`
		proxyTarget[util.inspect.custom] = handler.inspect;
		const proxy = new Proxy(proxyTarget, handler);
		handler.proxy = proxy;
		this.#rpcProxies.set(proxy, { raw, version: this.#version });
		return proxy;
	}

	/**
	 * Wraps a Cap'n Web stub we own (e.g. from a call result), releasing it once
	 * the returned proxy can't be used.
	 *
	 * @param raw Cap'n Web `RpcStub`
	 */
	createOwnedRpcProxy(raw: Disposable): object {
		const proxy = this.createRpcProxy(raw);
		this.#register(proxy, undefined, raw);
		return proxy;
	}

	/**
	 * Prepares arguments for a Workers RPC call over Cap'n Web.
	 *
	 * @param args Arguments passed by the user
	 */
	encodeArgs(args: unknown[]): unknown[] {
		const state = { inlineSize: 0 };
		const encodedArgs = args.map((arg) => this.#encode(arg, state));
		if (state.inlineSize > MAX_INLINE_SIZE) {
			throw new RangeError(
				"Arguments sent to the Workers runtime from Node.js must be less than 32 MiB once serialised"
			);
		}
		return encodedArgs;
	}

	#encode(value: unknown, state: { inlineSize: number }): unknown {
		if (typeof value === "string") {
			state.inlineSize += Buffer.byteLength(value);
			return value;
		}
		if (
			(typeof value !== "object" || value === null) &&
			typeof value !== "function"
		) {
			return value;
		}
		const rpcProxy = this.#rpcProxies.get(value);
		if (rpcProxy !== undefined) {
			if (rpcProxy.version !== this.#version) {
				throw poisonedError();
			}
			return rpcProxy.raw;
		}
		if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
			// Cap'n Web base64 encodes bytes
			state.inlineSize += Math.ceil(value.byteLength / 3) * 4;
			return value;
		}
		const globalHTTPObject = toGlobalHTTPObject(value);
		if (globalHTTPObject !== undefined) {
			return globalHTTPObject;
		}
		if (Array.isArray(value)) {
			return value.map((v) => this.#encode(v, state));
		}
		if (isPlainObject(value)) {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = this.#encode(v, state);
			}
			return result;
		}
		return value;
	}

	/**
	 * Converts a Workers RPC result received over Cap'n Web into values returned
	 * to the user.
	 *
	 * @param value Result received over Cap'n Web
	 */
	decode(value: unknown): unknown {
		if (
			(typeof value !== "object" || value === null) &&
			typeof value !== "function"
		) {
			return value;
		}
		// Cap'n Web resolves promises in results before returning them
		if (value instanceof RpcStub) {
			return this.createOwnedRpcProxy(value as unknown as Disposable);
		}
		if (value instanceof Error) {
			restoreErrorName(value);
			return value;
		}
		let result: object;
		if (Array.isArray(value)) {
			result = value.map((v) => this.decode(v));
		} else if (isPlainObject(value)) {
			const record: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				record[k] = this.decode(v);
			}
			result = record;
		} else {
			return value;
		}
		// Cap'n Web gives results a disposer, releasing all stubs inside
		if (Object.hasOwn(value, Symbol.dispose)) {
			Object.defineProperty(result, Symbol.dispose, {
				value: (value as unknown as Disposable)[Symbol.dispose],
				writable: true,
				configurable: true,
			});
		}
		return result;
	}

	poisonProxies(): void {
		this.#version++;
		// This function will be called whenever `setOptions()` or `dispose()` is
		// called. We must also unregister all finalizers as the heap will be reset,
		// and we don't want a new object added with the same address to be freed
		// when it's still accessible.
		this.#finalizationRegistry.unregister(this);
		// Close the session, rejecting calls on stubs returned over it
		this.#session?.dispose();
		this.#session = undefined;
	}

	dispose(): Promise<void> {
		clearTimeout(this.#finalizeBatchTimeout);
		this.poisonProxies();
		return this.sync.dispose();
	}
}

// Proxy handler for objects that speak Workers RPC (e.g. service bindings,
// Durable Object stubs, `RpcTarget`s and functions). Everything is forwarded
// to an underlying Cap'n Web stub, so these never block the main thread.
class RpcProxyHandler implements ProxyHandler<() => void> {
	readonly #version: number;
	#settled?: Promise<unknown>;
	#nativeHandler?: ProxyStubHandler<object>;
	// Proxy using this handler, the parent of proxies derived from it
	proxy?: object;

	constructor(
		readonly bridge: ProxyClientBridge,
		// Cap'n Web `RpcStub` or `RpcPromise`
		readonly raw: any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Cap'n Web stubs accept any property or call
		readonly target: NativeTarget | undefined,
		readonly isPromise: boolean,
		// Kept alive while this proxy is, see `ProxyClientBridge#createRpcProxy()`
		readonly parent: object | undefined
	) {
		this.#version = bridge.version;
	}

	get #poisoned() {
		return this.#version !== this.bridge.version;
	}
	#assertSafe() {
		if (this.#poisoned) {
			throw poisonedError();
		}
	}

	inspect = (_depth: number, options: util.InspectOptions) => {
		const details = { name: this.target?.[kName], poisoned: this.#poisoned };
		const type = this.isPromise ? "RpcPromise" : "RpcStub";
		return `${type} ${util.inspect(details, options)}`;
	};

	#settle(): Promise<unknown> {
		return (this.#settled ??= this.#resolve());
	}
	async #resolve(): Promise<unknown> {
		try {
			return this.bridge.decode(await this.raw);
		} catch (e) {
			restoreErrorName(e);
			if (typeof e === "object" && e !== null) {
				Error.captureStackTrace(e, this.#resolve);
			}
			throw e;
		}
	}

	get(_target: () => void, key: string | symbol) {
		if (key === util.inspect.custom) {
			return this.inspect;
		}
		this.#assertSafe();

		if (this.isPromise) {
			if (key === "then") {
				return (
					onFulfilled?: (value: unknown) => unknown,
					onRejected?: (reason: unknown) => unknown
				) => this.#settle().then(onFulfilled, onRejected);
			}
			if (key === "catch") {
				return (onRejected?: (reason: unknown) => unknown) =>
					this.#settle().catch(onRejected);
			}
			if (key === "finally") {
				return (onFinally?: () => void) => this.#settle().finally(onFinally);
			}
		}
		if (key === Symbol.dispose) {
			// Only stubs, and promises for call results, are disposable
			return this.raw[Symbol.dispose];
		}
		// Ignore all other symbol properties, or `then()`s of stubs, which
		// shouldn't be thenable
		if (typeof key === "symbol" || key === "then") {
			return undefined;
		}

		if (this.target !== undefined) {
			const name = this.target[kName];
			// Handle these like native objects. See `isFetcherFetch()` and
			// `isDurableObjectStub()` comments for why they're special.
			const native = (this.#nativeHandler ??= new ProxyStubHandler(
				this.bridge,
				this.target
			));
			if (isFetcherFetch(name, key)) {
				return (...args: unknown[]) => {
					this.#assertSafe();
					return native.fetcherFetchCall(args);
				};
			}
			if (isDurableObjectStub(name) && (key === "id" || key === "name")) {
				return native.get({}, key, undefined);
			}
		}
		return this.bridge.createRpcProxy(
			this.raw[key],
			undefined,
			true,
			this.proxy
		);
	}

	apply(_target: () => void, _thisArg: unknown, args: unknown[]) {
		this.#assertSafe();
		const encodedArgs = this.bridge.encodeArgs(args);
		return this.bridge.createRpcProxy(
			this.raw(...encodedArgs),
			undefined,
			true,
			this.proxy
		);
	}
}

// Proxy handler for native "heap" objects (e.g. `KVNamespace`, `R2Object`)
class ProxyStubHandler<T extends object> implements ProxyHandler<T> {
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
			const [address, name, isRpc] = value as unknown[];
			assert(typeof address === "number");
			assert(typeof name === "string");
			assert(typeof isRpc === "boolean");
			const target: NativeTarget = {
				[kAddress]: address,
				[kName]: name,
			};
			if (isRpc) {
				return this.bridge.createHeapRpcProxy(target);
			}
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
		const proxy = this.bridge.getProxy(target) as any;
		const binding = {
			info: (stream: ReadableStream<Uint8Array>) => {
				return proxy["info"](stream);
			},
			input: (stream: ReadableStream<Uint8Array>) => {
				return transformer(proxy, stream, []);
			},
			get hosted(): ImagesBinding["hosted"] {
				return proxy["hosted"];
			},
		};
		return binding;
	}

	constructor(
		readonly bridge: ProxyClientBridge,
		readonly target: NativeTarget
	) {
		this.#version = bridge.version;
		this.#stringifiedTarget = stringify(this.target, reducers);
	}

	get #poisoned() {
		return this.#version !== this.bridge.version;
	}
	#assertSafe() {
		if (this.#poisoned) {
			throw poisonedError();
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
		if (typeHeader === "Promise, ReadableStream") {
			if (res.body !== null) {
				this.bridge.trackStreamLength(res.body, res.headers);
			}
			return res.body;
		}
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
		if (syncRes.body instanceof ReadableStream) {
			this.bridge.trackStreamLength(syncRes.body, syncRes.headers);
			return syncRes.body;
		}

		const stringifiedResult = DECODER.decode(syncRes.body);
		const result = parseWithReadableStreams(
			NODE_PLATFORM_IMPL,
			{ value: stringifiedResult },
			this.revivers
		);
		return this.#maybeThrow(syncRes, result, caller);
	}

	get(_target: T, key: string | symbol, _receiver: unknown) {
		this.#assertSafe();

		// When `devalue` `stringify`ing `Proxy`, treat it as a `NativeTarget`
		// (allows native proxies to be used as arguments, e.g. `DurableObjectId`s)
		if (key === kAddress) {
			return this.target[kAddress];
		}
		if (key === kName) {
			return this.target[kName];
		}
		// Ignore all other symbol properties, or `then()`s. We should never return
		// `Promise`s or thenables as native targets, and want to avoid the extra
		// network call when `await`ing the proxy.
		if (typeof key === "symbol" || key === "then") {
			return undefined;
		}

		// See optimisation comments below for cases where this will be set
		const maybeKnown = this.#knownValues.get(key);
		if (maybeKnown !== undefined) {
			return maybeKnown;
		}

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

		if (typeof key === "symbol") {
			return undefined;
		}

		// Optimisation: assume constant prototypes of proxied objects, descriptors
		// should never change after we've fetched them
		const maybeKnown = this.#knownDescriptors.get(key);
		if (maybeKnown !== undefined) {
			return maybeKnown;
		}

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
		if (this.#knownOwnKeys !== undefined) {
			return this.#knownOwnKeys;
		}

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
				if (!knownAsync && result instanceof Promise) {
					knownAsync = true;
				}
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
		if (isFetcherFetch(targetName, key)) {
			return this.fetcherFetchCall(args);
		}

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
				// `arg` may be a `Headers` instance from a different realm than the
				// `undici` copy Miniflare uses internally (e.g. Node's global
				// `Headers`), so check its shape rather than its prototype chain.
				assert(isHeadersLike(arg));
				assert(isHeadersLike(result));
				for (const [key, value] of result) {
					arg.set(key, value);
				}
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
			const streamSize = this.bridge.getStreamLength(
				stringified.unbufferedStream
			);
			const body = prefixStream(encodedArgs, stringified.unbufferedStream);
			resPromise = this.bridge.dispatchFetch(this.bridge.url, {
				method: "POST",
				headers: {
					[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
					[CoreHeaders.OP]: ProxyOps.CALL,
					[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
					[CoreHeaders.OP_KEY]: key,
					[CoreHeaders.OP_STRINGIFIED_SIZE]: argsSize,
					...(streamSize === undefined
						? {}
						: { [CoreHeaders.OP_STREAM_SIZE]: streamSize.toString() }),
				},
				duplex: "half",
				body,
			});
		}

		return this.#parseAsyncResponse(resPromise);
	}
	fetcherFetchCall(args: unknown[]) {
		let userRequest: Request | globalThis.Request;
		if (args[0] instanceof globalThis.Request) {
			const globalRequestInit = args[1] as ConstructorParameters<
				typeof globalThis.Request
			>[1];
			userRequest = new globalThis.Request(args[0], globalRequestInit);
		} else {
			// @ts-expect-error `...args` isn't type-safe here, but `undici` should
			//  validate types at runtime, and throw appropriate errors
			userRequest = new Request(...args);
		}
		const body = userRequest.body;
		// Create an internal transport request with the proxy URL. `mode` and
		// `keepalive` aren't sent over HTTP, and undici rejects exposed stream
		// bodies combined with `no-cors` or `keepalive`.
		const request = new Request(this.bridge.url, {
			method: userRequest.method,
			headers: userRequest.headers,
			redirect: userRequest.redirect,
			integrity: userRequest.integrity,
			signal: userRequest.signal,
			mode:
				body !== null && userRequest.mode === "no-cors"
					? "cors"
					: userRequest.mode,
			credentials: userRequest.credentials,
			cache: userRequest.cache,
			referrer: userRequest.referrer,
			referrerPolicy: userRequest.referrerPolicy,
			keepalive: body === null && userRequest.keepalive,
			...(body === null ? {} : { body, duplex: "half" as const }),
			cf:
				userRequest instanceof Request
					? userRequest.cf
					: ((args[1] as RequestInit | undefined)?.cf ??
						(args[0] as { cf?: RequestInit["cf"] }).cf),
		});
		// If adding new headers here, remember to `delete()` them in `ProxyServer`
		// before calling `fetch()`.
		request.headers.set(CoreHeaders.OP_ORIGINAL_URL, userRequest.url);
		request.headers.set(CoreHeaders.OP_SECRET, PROXY_SECRET_HEX);
		request.headers.set(CoreHeaders.OP, ProxyOps.CALL);
		request.headers.set(CoreHeaders.OP_TARGET, this.#stringifiedTarget);
		request.headers.set(CoreHeaders.OP_KEY, "fetch");
		return this.bridge.dispatchFetch(request);
	}
}
