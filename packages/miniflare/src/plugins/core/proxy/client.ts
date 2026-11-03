import assert from "node:assert";
import crypto from "node:crypto";
import { ReadableStream } from "node:stream/web";
import util from "node:util";
import { newWebSocketRpcSession, RpcPromise, RpcStub } from "capnweb";
import { stringify } from "devalue";
import { Agent, WebSocket } from "undici";
import { Headers, Request, Response } from "../../../http";
import {
	CoreHeaders,
	CorePaths,
	createHTTPReducers,
	createHTTPRevivers,
	isDurableObjectStub,
	isFetcherFetch,
	isHeadersLike,
	isProxyEncoded,
	isR2ObjectWriteHttpMetadata,
	isRequestLike,
	isResponseLike,
	parseWithReadableStreams,
	PROXY_ENCODED_KEY,
	PROXY_ERROR_NAME_KEY,
	ProxyAddresses,
	ProxyOps,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "../../../workers";
import { DECODER, SynchronousFetcher } from "./fetch-sync";
import { NODE_PLATFORM_IMPL } from "./types";
import type { DispatchFetch, RequestInit } from "../../../http";
import type {
	ProxyEncoded,
	ProxyRpcApi,
	ReducersRevivers,
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
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		kAddress in value
	);
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

// Thrown by `syncReducers` when arguments can't be sent synchronously
const kRequiresAsync = Symbol("kRequiresAsync");
const syncReducers: ReducersRevivers = {
	...reducers,
	// Streams and `Blob`s can't be read while the main thread is blocked, and
	// functions can only be sent as Cap'n Web stubs, so these must be async
	ReadableStream(value) {
		if (value instanceof ReadableStream) {
			throw kRequiresAsync;
		}
	},
	Blob(value) {
		if (value instanceof Blob) {
			throw kRequiresAsync;
		}
	},
	Function(value) {
		if (typeof value === "function") {
			throw kRequiresAsync;
		}
	},
};

export const PROXY_SECRET = crypto.randomBytes(16);
const PROXY_SECRET_HEX = PROXY_SECRET.toString("hex");

function isClientError(status: number) {
	return 400 <= status && status < 500;
}

function isObject(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function encoded(type: string, ...data: unknown[]): ProxyEncoded {
	return { [PROXY_ENCODED_KEY]: [type, ...data] };
}

// Cap'n Web drops keys like `constructor` to prevent prototype pollution
function hasPrototypeKey(value: object): boolean {
	return Object.keys(value).some((key) => key in Object.prototype);
}

// `workerd` closes WebSockets receiving messages over 32 MiB, ending the
// session and breaking every stub. Strings and bytes passed to native methods
// larger than this threshold are sent as streams, as Cap'n Web sends each
// chunk in its own message. Calls with more data than `MAX_INLINE_SIZE` left in
// the message are rejected before they're sent.
const STREAMED_VALUE_THRESHOLD = 64 * 1024; // 64 KiB
const MAX_INLINE_SIZE = 31 * 1024 * 1024; // 31 MiB, leaving room for the rest
const BYTES_CONSTRUCTORS = [
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

/**
 * @param value Bytes to send to `ProxyServer`
 * @returns Stream of `value`, copied so later changes aren't sent, in chunks
 * small enough for `workerd`
 */
function toChunkedStream(
	value: ArrayBuffer | ArrayBufferView
): ReadableStream<Uint8Array> {
	const bytes =
		value instanceof ArrayBuffer
			? new Uint8Array(value.slice(0))
			: new Uint8Array(
					value.buffer,
					value.byteOffset,
					value.byteLength
				).slice();
	let offset = 0;
	return new ReadableStream({
		pull(controller) {
			const end = Math.min(offset + STREAMED_VALUE_THRESHOLD, bytes.byteLength);
			controller.enqueue(bytes.subarray(offset, end));
			offset = end;
			if (offset === bytes.byteLength) {
				controller.close();
			}
		},
	});
}

/**
 * @param value Bytes about to be streamed to `ProxyServer`
 * @returns Name of the class `ProxyServer` should revive `value` as
 */
function getBytesType(value: ArrayBuffer | ArrayBufferView): string {
	if (value instanceof ArrayBuffer) {
		return "ArrayBuffer";
	}
	// Subclasses like Node.js `Buffer` are revived as their standard parent
	return (
		BYTES_CONSTRUCTORS.find((ctor) => value instanceof ctor)?.name ??
		"Uint8Array"
	);
}

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
		const request = new globalThis.Request(value.url, {
			method: value.method,
			headers: [...value.headers.entries()],
			body: value.body as globalThis.ReadableStream | null,
			redirect: value.redirect as globalThis.RequestInit["redirect"],
			duplex: value.body === null ? undefined : "half",
		});
		// Cap'n Web serialises `cf` if present
		if (value.cf !== undefined) {
			Object.defineProperty(request, "cf", { value: value.cf });
		}
		return request;
	}
	if (isResponseLike(value)) {
		const response = new globalThis.Response(
			value.body as globalThis.ReadableStream | null,
			{
				status: value.status,
				statusText: value.statusText,
				headers: [...value.headers.entries()],
			}
		);
		if (value.cf !== undefined) {
			Object.defineProperty(response, "cf", { value: value.cf });
		}
		return response;
	}
}

/**
 * Converts Node's global `Headers`, `Request`s and `Response`s, which Cap'n Web
 * returns, to Miniflare's classes returned by the rest of the proxy.
 *
 * @param value Result received over Cap'n Web
 * @returns Equivalent Miniflare instance, or `undefined` if `value` isn't one
 * of these types
 */
function fromGlobalHTTPObject(value: object): object | undefined {
	if (value instanceof globalThis.Headers) {
		return new Headers([...value.entries()]);
	}
	if (value instanceof globalThis.Request) {
		return new Request(value.url, {
			method: value.method,
			headers: [...value.headers.entries()],
			body: value.body,
			redirect: value.redirect,
			duplex: value.body === null ? undefined : "half",
			cf: (value as { cf?: RequestInit["cf"] }).cf,
		});
	}
	if (value instanceof globalThis.Response) {
		return new Response(value.body, {
			status: value.status,
			statusText: value.statusText,
			headers: [...value.headers.entries()],
		});
	}
}

// Cap'n Web stub for `ProxyServer`'s main interface. `stub()` returns an
// `RpcPromise`, so calls can be pipelined on the result without awaiting it.
type ProxyRpcStub = {
	[K in keyof ProxyRpcApi]: (
		...args: Parameters<ProxyRpcApi[K]>
	) => RpcPromise<unknown>;
} & Disposable;

// Cap'n Web session with `ProxyServer`, used for all asynchronous operations
class ProxyRpcSession {
	readonly api: ProxyRpcStub;
	// Resolves once the WebSocket has opened, or failed to
	readonly ready: Promise<void>;
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
		this.ready = new Promise((resolve) => {
			this.#webSocket.addEventListener("open", () => resolve(), {
				once: true,
			});
			// Cap'n Web listens for "error"s and rejects pending calls
			this.#webSocket.addEventListener(
				"close",
				() => {
					this.#closed = true;
					resolve();
				},
				{ once: true }
			);
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
	 * Resolves once proxies can be used without blocking the main thread on
	 * worker startup, or waiting for the Cap'n Web session to connect.
	 */
	warm(): Promise<void> {
		return this.#bridge.warm();
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

interface MethodKnowledge {
	methods: Set<string>;
	// Methods known to return `Promise`s
	asyncMethods: Set<string>;
}

interface NativeTargetHeldValue {
	// "Heap" address, if this is a proxy for a "heap" object
	address?: number;
	version: number;
	// Cap'n Web stub to release
	stub?: Disposable;
}

// Class containing functions that should accessible by both `ProxyClient` and
// proxy handlers, but not exported to consumers of `ProxyClient`
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
	// sending a request for each address, we batch finalisations within 100ms of
	// each other into one call.
	readonly #finalizeBatch: NativeTargetHeldValue[] = [];
	#finalizeBatchTimeout?: ReturnType<typeof setTimeout>;

	readonly sync = new SynchronousFetcher();
	#session?: ProxyRpcSession;

	// Methods of each native type, and those known to return `Promise`s.
	// Assumes instances of the same type share a prototype, so we only need to
	// synchronously look up, and call, each method once per type. After that,
	// async methods are called over Cap'n Web without blocking.
	readonly #methodKnowledge = new Map<string, MethodKnowledge>();

	// Underlying Cap'n Web stubs for proxies, and native targets for proxies
	// to native "heap" objects, used when sending proxies as arguments
	readonly #rpcProxies = new WeakMap<
		object,
		{ raw: object; target?: NativeTarget; version: number }
	>();
	readonly #nativeProxies = new WeakMap<
		object,
		{ target: NativeTarget; version: number }
	>();

	readonly revivers: ReducersRevivers = {
		...structuredSerializableRevivers,
		...createHTTPRevivers(NODE_PLATFORM_IMPL),
		Native: (value) => {
			assert(Array.isArray(value));
			const [address, name, isRpc] = value as unknown[];
			assert(typeof address === "number");
			assert(typeof name === "string");
			assert(typeof isRpc === "boolean");
			return this.createProxy(address, name, isRpc);
		},
	};

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

	async warm(): Promise<void> {
		// Make sure the session exists before waiting for it
		void this.rpc;
		assert(this.#session !== undefined);
		await Promise.all([this.sync.warm(), this.#session.ready]);
	}

	/**
	 * @param name `constructor.name` of a native "heap" object
	 * @returns Methods known for objects of this type, shared between them
	 */
	getMethodKnowledge(name: string): MethodKnowledge {
		// Plain objects with methods share a type name, but not their shape
		if (name === "Object") {
			return { methods: new Set(), asyncMethods: new Set() };
		}
		let knowledge = this.#methodKnowledge.get(name);
		if (knowledge === undefined) {
			knowledge = { methods: new Set(), asyncMethods: new Set() };
			this.#methodKnowledge.set(name, knowledge);
		}
		return knowledge;
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

	#finalizeProxy = (held: NativeTargetHeldValue) => {
		// Called when the `Proxy` with address `targetAddress` gets garbage
		// collected. This removes the target from the `ProxyServer` "heap".
		this.#finalizeBatch.push(held);
		clearTimeout(this.#finalizeBatchTimeout);
		this.#finalizeBatchTimeout = setTimeout(this.#finalizeProxyBatch, 100);
	};

	#finalizeProxyBatch = () => {
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
		if (addresses.length === 0) {
			return;
		}
		// Ignore errors when freeing. If this throws, it's likely the runtime has
		// shutdown, so the entire "heap" has been destroyed anyway.
		this.rpc.free(addresses).then(
			() => {},
			() => {}
		);
	};

	#register(proxy: object, address?: number, stub?: Disposable) {
		const held: NativeTargetHeldValue = {
			address,
			version: this.#version,
			stub,
		};
		this.#finalizationRegistry.register(proxy, held, this);
	}

	/**
	 * Creates a proxy for a "heap" object returned by `ProxyServer`.
	 *
	 * @param address "Heap" address of the object
	 * @param name `constructor.name` of the object
	 * @param isRpc Whether the object speaks Workers RPC
	 */
	createProxy(address: number, name: string, isRpc: boolean): unknown {
		const target: NativeTarget = { [kAddress]: address, [kName]: name };
		if (name === "Promise") {
			// We'll only see `Promise`s from synchronous operations, which don't
			// wait for them. Resolve them over Cap'n Web instead.
			return this.callRpc((rpc) => rpc.resolve(address));
		}
		if (isRpc) {
			// Cap'n Web pipelines calls on the returned `RpcPromise`, so we can use
			// it immediately, without waiting for a round trip
			const stub = this.rpc.stub(address);
			const proxy = this.createRpcProxy(stub, target);
			this.#register(proxy, address, stub);
			return proxy;
		}
		const proxy = this.getProxy<Record<string, unknown>>(target);
		// See createMediaProxy() for why this is special
		return name === "ImagesBindingImpl" ? createMediaProxy(proxy) : proxy;
	}

	getProxy<T extends object>(target: NativeTarget, register = true): T {
		const handler = new ProxyStubHandler(this, target);
		const proxyTarget: { [util.inspect.custom]?: unknown } = {
			[util.inspect.custom]: handler.inspect,
		};
		const proxy = new Proxy<T>(proxyTarget as T, handler);
		this.#nativeProxies.set(proxy, { target, version: this.#version });
		if (register) {
			this.#register(proxy, target[kAddress]);
		}
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
		this.#rpcProxies.set(proxy, { raw, target, version: this.#version });
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
	 * Calls `ProxyServer` over Cap'n Web, decoding the result. Errors are
	 * updated to include the caller's stack.
	 *
	 * @param invoke Function making the call
	 */
	async callRpc(
		invoke: (rpc: ProxyRpcStub) => PromiseLike<unknown>
	): Promise<unknown> {
		try {
			return this.decode(await invoke(this.rpc));
		} catch (e) {
			restoreErrorName(e);
			if (typeof e === "object" && e !== null) {
				// Update the stack trace to include the calling location in Node
				// (as opposed to inside the proxy server) which is much more useful
				// for debugging. Specifying `callRpc` here hides our internal
				// implementation functions from the stack.
				Error.captureStackTrace(e, this.callRpc);
			}
			throw e;
		}
	}

	/**
	 * Prepares arguments to be sent over Cap'n Web.
	 *
	 * @param args Arguments passed by the user
	 * @param mode `"native"` if `args` will be passed to a native method by
	 * `ProxyServer`, which can revive {@link ProxyEncoded} values. `"rpc"` if
	 * Cap'n Web will forward `args` straight to a Workers RPC target.
	 */
	encodeArgs(args: unknown[], mode: "native" | "rpc"): unknown[] {
		const state = { inlineSize: 0 };
		const encodedArgs = args.map((arg) => this.#encode(arg, mode, state));
		if (state.inlineSize > MAX_INLINE_SIZE) {
			throw new RangeError(
				"Arguments sent to the Workers runtime from Node.js must be less than 32 MiB once serialised"
			);
		}
		return encodedArgs;
	}

	#encode(
		value: unknown,
		mode: "native" | "rpc",
		state: { inlineSize: number }
	): unknown {
		if (typeof value === "string") {
			if (mode === "native" && value.length > STREAMED_VALUE_THRESHOLD) {
				return encoded("String", toChunkedStream(Buffer.from(value)));
			}
			state.inlineSize += Buffer.byteLength(value);
			return value;
		}
		if (!isObject(value)) {
			return value;
		}
		const rpcProxy = this.#rpcProxies.get(value);
		if (rpcProxy !== undefined) {
			if (rpcProxy.version !== this.#version) {
				throw poisonedError();
			}
			// Native methods want the actual object, rather than a stub to it
			return mode === "native" && rpcProxy.target !== undefined
				? encoded("Handle", rpcProxy.target[kAddress])
				: rpcProxy.raw;
		}
		const nativeProxy = this.#nativeProxies.get(value);
		if (nativeProxy !== undefined) {
			if (nativeProxy.version !== this.#version) {
				throw poisonedError();
			}
			if (mode === "rpc") {
				throw new DOMException(
					`Could not serialize object of type "${nativeProxy.target[kName]}". This type does not support serialization.`,
					"DataCloneError"
				);
			}
			return encoded("Handle", nativeProxy.target[kAddress]);
		}
		if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
			if (mode === "native" && value.byteLength > STREAMED_VALUE_THRESHOLD) {
				return encoded("Bytes", toChunkedStream(value), getBytesType(value));
			}
			// Cap'n Web base64 encodes bytes
			state.inlineSize += Math.ceil(value.byteLength / 3) * 4;
			return value;
		}
		const globalHTTPObject = toGlobalHTTPObject(value);
		if (globalHTTPObject !== undefined) {
			return globalHTTPObject;
		}
		// Cap'n Web only accepts exact `Blob`s, but Node.js sometimes returns
		// subclasses (e.g. from `Blob#slice()` in Node.js 22)
		if (
			value instanceof Blob &&
			!(value instanceof File) &&
			Object.getPrototypeOf(value) !== Blob.prototype
		) {
			return new Blob([value], { type: value.type });
		}
		// Workers RPC targets will need to handle these types themselves once
		// Cap'n Web supports them
		if (mode === "native") {
			if (value instanceof File) {
				return encoded(
					"File",
					new Blob([value], { type: value.type }),
					value.name,
					value.lastModified
				);
			}
			if (value instanceof Map) {
				return encoded(
					"Map",
					Array.from(value, ([k, v]) => [
						this.#encode(k, mode, state),
						this.#encode(v, mode, state),
					])
				);
			}
			if (value instanceof Set) {
				return encoded(
					"Set",
					Array.from(value, (v) => this.#encode(v, mode, state))
				);
			}
			if (value instanceof RegExp) {
				return encoded("RegExp", value.source, value.flags);
			}
			if (value instanceof ReadableStream) {
				const length = (value as LengthTrackedStream)[kStreamLength];
				if (length !== undefined) {
					return encoded("Stream", value, length);
				}
			}
		}
		if (Array.isArray(value)) {
			return value.map((v) => this.#encode(v, mode, state));
		}
		if (isPlainObject(value)) {
			if (mode === "native" && hasPrototypeKey(value)) {
				return encoded(
					"Object",
					Object.entries(value).map(([k, v]) => [
						k,
						this.#encode(v, mode, state),
					])
				);
			}
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = this.#encode(v, mode, state);
			}
			return result;
		}
		return value;
	}

	/**
	 * Converts a result received over Cap'n Web into values returned to the
	 * user.
	 *
	 * @param value Result received over Cap'n Web
	 */
	decode(value: unknown): unknown {
		if (!isObject(value)) {
			return value;
		}
		if (value instanceof RpcStub) {
			return this.createOwnedRpcProxy(value as unknown as Disposable);
		}
		if (value instanceof RpcPromise) {
			return this.createRpcProxy(value, undefined, /* isPromise */ true);
		}
		if (isProxyEncoded(value)) {
			const [type, ...data] = value[PROXY_ENCODED_KEY];
			switch (type) {
				case "Handle": {
					const [address, name, isRpc] = data;
					assert(typeof address === "number");
					assert(typeof name === "string");
					assert(typeof isRpc === "boolean");
					return this.createProxy(address, name, isRpc);
				}
				case "Map":
					return new Map(
						(data[0] as [unknown, unknown][]).map(([k, v]) => [
							this.decode(k),
							this.decode(v),
						])
					);
				case "Set":
					return new Set((data[0] as unknown[]).map((v) => this.decode(v)));
				case "Object": {
					const result = {};
					for (const [k, v] of data[0] as [string, unknown][]) {
						// Define rather than assign, so `__proto__` isn't treated specially
						Object.defineProperty(result, k, {
							value: this.decode(v),
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
			}
			assert.fail(`Unexpected encoded value type: ${type}`);
		}
		if (value instanceof Error) {
			restoreErrorName(value);
			return value;
		}
		const httpObject = fromGlobalHTTPObject(value);
		if (httpObject !== undefined) {
			return httpObject;
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

	/**
	 * Calls `Fetcher#fetch()` with `dispatchFetch()` rather than Cap'n Web. See
	 * `isFetcherFetch()` comment for why this is special.
	 *
	 * @param target Native target for the `Fetcher` or Durable Object stub
	 * @param args Arguments passed to `fetch()`
	 */
	fetcherFetch(target: NativeTarget, args: unknown[]) {
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
		const request = new Request(this.url, {
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
		request.headers.set(CoreHeaders.OP_TARGET, stringify(target, reducers));
		request.headers.set(CoreHeaders.OP_KEY, "fetch");
		return this.dispatchFetch(request);
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
		// The new runtime's types may differ (e.g. compatibility flags changed)
		this.#methodKnowledge.clear();
	}

	dispose(): Promise<void> {
		clearTimeout(this.#finalizeBatchTimeout);
		this.poisonProxies();
		return this.sync.dispose();
	}
}

/**
 * Images bindings are some of the most complex bindings from an API perspective, other than RPC. In particular, they expose a _synchronous_ API that accepts ReadableStream arguments.
 * Multiple synchronous APIs are chained together in a builder pattern (e.g. `await env.IMAGES.input(stream).transform(...).output(...)`) before the final `.output()` call is awaited.
 * This breaks our assumptions around functions that accept ReadableStream arguments always being async, and so doesn't work without some special casing.
 *
 * Ref: https://developers.cloudflare.com/images/transform-images/bindings/
 *
 * @param proxy Proxy for the native `ImagesBindingImpl`
 */
function createMediaProxy(proxy: Record<string, unknown>) {
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
	const images = proxy as unknown as Parameters<typeof transformer>[0] & {
		info(stream: ReadableStream<Uint8Array>): unknown;
		hosted: ImagesBinding["hosted"];
	};
	return {
		info: (stream: ReadableStream<Uint8Array>) => {
			return images.info(stream);
		},
		input: (stream: ReadableStream<Uint8Array>) => {
			return transformer(images, stream, []);
		},
		get hosted(): ImagesBinding["hosted"] {
			return images.hosted;
		},
	};
}

// Proxy handler for objects that speak Workers RPC (e.g. service bindings,
// Durable Object stubs, `RpcTarget`s and functions). Everything is forwarded
// to an underlying Cap'n Web stub, so these never block the main thread.
class RpcProxyHandler implements ProxyHandler<() => void> {
	readonly #version: number;
	#settled?: Promise<unknown>;
	#nativeProxy?: Record<string, unknown>;
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
		if (this.target !== undefined) {
			// Allows this to be sent to native methods (e.g. by `devalue`)
			if (key === kAddress) {
				return this.target[kAddress];
			}
			if (key === kName) {
				return this.target[kName];
			}
		}

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
		// Cap'n Web's own stub methods
		if (key === "dup") {
			return () => this.bridge.createOwnedRpcProxy(this.raw.dup());
		}
		if (key === "onRpcBroken") {
			return (callback: (error: unknown) => void) =>
				this.raw.onRpcBroken(callback);
		}
		if (key === "map") {
			return (func: (value: unknown) => unknown) =>
				this.bridge.createRpcProxy(
					this.raw.map(func),
					undefined,
					true,
					this.proxy
				);
		}

		const name = this.target?.[kName];
		if (name !== undefined) {
			if (isFetcherFetch(name, key)) {
				return (...args: unknown[]) => {
					this.#assertSafe();
					assert(this.target !== undefined);
					return this.bridge.fetcherFetch(this.target, args);
				};
			}
			if (isDurableObjectStub(name) && (key === "id" || key === "name")) {
				this.#nativeProxy ??= this.bridge.getProxy(
					this.target as NativeTarget,
					/* register */ false
				);
				return this.#nativeProxy[key];
			}
		}
		return this.bridge.createRpcProxy(
			this.raw[key],
			undefined,
			true,
			this.proxy
		);
	}

	has(target: () => void, key: string | symbol) {
		if (this.target !== undefined && (key === kAddress || key === kName)) {
			return true;
		}
		// Like Workers RPC stubs, appear to have every property
		return typeof key === "string" || Reflect.has(target, key);
	}

	apply(_target: () => void, _thisArg: unknown, args: unknown[]) {
		this.#assertSafe();
		const encodedArgs = this.bridge.encodeArgs(args, "rpc");
		return this.bridge.createRpcProxy(
			this.raw(...encodedArgs),
			undefined,
			true,
			this.proxy
		);
	}
}

// Proxy handler for native "heap" objects (e.g. `KVNamespace`, `R2Object`).
// These may have synchronous methods and properties, which block the main
// thread while `ProxyServer` responds. Async methods are called over Cap'n Web
// once known, see `ProxyClientBridge#getMethodKnowledge()`.
class ProxyStubHandler<T extends object> implements ProxyHandler<T> {
	readonly #version: number;
	readonly #stringifiedTarget: string;
	readonly #methodKnowledge: MethodKnowledge;
	readonly #knownValues = new Map<string, unknown>();
	readonly #knownDescriptors = new Map<
		string,
		PropertyDescriptor | undefined
	>();
	#knownOwnKeys?: string[];

	constructor(
		readonly bridge: ProxyClientBridge,
		readonly target: NativeTarget
	) {
		this.#version = bridge.version;
		this.#stringifiedTarget = stringify(this.target, reducers);
		this.#methodKnowledge = bridge.getMethodKnowledge(target[kName]);
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
		const details = { name: this.target[kName], poisoned: this.#poisoned };
		return `ProxyStub ${util.inspect(details, options)}`;
	};

	#maybeThrow(
		res: { status: number },
		result: unknown,
		caller: Function // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- passed to `Error.captureStackTrace()`
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
			// Returning a non-200/500 is an internal error
			assert(res.status === 200);
			return result;
		}
	}
	#parseSyncResponse(
		syncRes: SynchronousResponse,
		caller: Function // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- passed to `Error.captureStackTrace()`
	): unknown {
		assert(!isClientError(syncRes.status));
		assert(syncRes.body !== null);
		if (syncRes.body instanceof ReadableStream) {
			this.bridge.trackStreamLength(syncRes.body, syncRes.headers);
			return syncRes.body;
		}

		const stringifiedResult = DECODER.decode(syncRes.body);
		const result = parseWithReadableStreams(
			NODE_PLATFORM_IMPL,
			{ value: stringifiedResult },
			this.bridge.revivers
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

		let result: unknown;
		if (this.#methodKnowledge.methods.has(key)) {
			result = this.#createFunction(key);
		} else {
			const syncRes = this.bridge.sync.fetch(this.bridge.url, {
				method: "POST",
				headers: {
					[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
					[CoreHeaders.OP]: ProxyOps.GET,
					[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
					[CoreHeaders.OP_KEY]: key,
				},
			});
			if (syncRes.headers.get(CoreHeaders.OP_RESULT_TYPE) === "Function") {
				this.#methodKnowledge.methods.add(key);
				result = this.#createFunction(key);
			} else {
				result = this.#parseSyncResponse(syncRes, this.get);
			}
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
		// `{ [key]: () => {} }[key]` evaluates to a function named `key` as opposed
		// to `(anonymous)`. This is useful for debugging, as logging the function
		// will include the name.
		const func = {
			[key]: (...args: unknown[]) => this.#call(key, args, func),
		}[key];
		return func;
	}
	#call(
		key: string,
		args: unknown[],
		caller: Function // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- passed to `Error.captureStackTrace()`
	): unknown {
		this.#assertSafe();

		const targetName = this.target[kName];
		if (this.#methodKnowledge.asyncMethods.has(key)) {
			return this.#asyncCall(key, args);
		}

		let stringifiedArgs: string;
		try {
			stringifiedArgs = stringify(args, syncReducers);
		} catch (e) {
			if (e === kRequiresAsync) {
				return this.#asyncCall(key, args);
			}
			throw e;
		}
		const result = this.#syncCall(key, stringifiedArgs, caller);
		// Optimisation: if the method returns a `Promise`, we know it must be
		// async (assuming all async methods always return `Promise`s). Future
		// calls can then skip the synchronous call, and its round trip to resolve
		// the returned `Promise`.
		if (result instanceof Promise) {
			this.#methodKnowledge.asyncMethods.add(key);
		}
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
	#syncCall(
		key: string,
		stringifiedArgs: string,
		caller: Function // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- passed to `Error.captureStackTrace()`
	): unknown {
		const syncRes = this.bridge.sync.fetch(this.bridge.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.CALL,
				[CoreHeaders.OP_TARGET]: this.#stringifiedTarget,
				[CoreHeaders.OP_KEY]: key,
				"Content-Length": Buffer.byteLength(stringifiedArgs).toString(),
			},
			body: stringifiedArgs,
		});
		return this.#parseSyncResponse(syncRes, caller);
	}
	#asyncCall(key: string, args: unknown[]): Promise<unknown> {
		const address = this.target[kAddress];
		return this.bridge.callRpc((rpc) =>
			rpc.call(address, key, this.bridge.encodeArgs(args, "native"))
		);
	}
}
