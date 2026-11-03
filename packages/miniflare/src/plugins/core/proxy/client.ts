import assert from "node:assert";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { arrayBuffer, json, text } from "node:stream/consumers";
import util from "node:util";
import { newWebSocketRpcSession } from "capnweb";
import { Agent, WebSocket } from "undici";
import { Headers, Request, Response } from "../../../http";
import { CoreHeaders, CorePaths, ProxyOps } from "../../../workers";
// Imported directly, so the codec isn't part of Miniflare's public API
import {
	assertInlineSize,
	PROXY_ENCODED_KEY,
	prepareErrorForSend,
	ProxyCodec,
	restoreErrorName,
	setStreamLength,
} from "../../../workers/core/proxy-codec";
import { DECODER, SynchronousFetcher } from "./fetch-sync";
import type { DispatchFetch, RequestInit } from "../../../http";
import type {
	ProxyDurableObjectId,
	ProxyRpcApi,
	ProxySyncRequest,
} from "../../../workers";
import type {
	EncodeState,
	ProxyEncoded,
} from "../../../workers/core/proxy-codec";
import type { RpcPromise, RpcStub } from "capnweb";
import type { ReadableStream } from "node:stream/web";

export const PROXY_SECRET = crypto.randomBytes(16);
const PROXY_SECRET_HEX = PROXY_SECRET.toString("hex");

function poisonedError() {
	return new Error(
		"Attempted to use poisoned stub. Stubs to runtime objects must be " +
			"re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`."
	);
}

function connectionLostError() {
	return new Error(
		"Attempted to use stub after the connection to the Workers runtime was " +
			"lost. Stubs returned by bindings must be re-created."
	);
}

// `instanceof` checks against a specific `Headers`/`Request`/`Response`
// implementation fail for values created against a *different* copy of that
// class. This happens more often than you'd expect: for example, Node's
// built-in global `Headers` is backed by an internal copy of `undici` that
// isn't `instanceof` the `undici` package Miniflare imports. All
// spec-compliant implementations set `Symbol.toStringTag` though, so use that
// as a realm-independent discriminator.
function hasStringTag(value: unknown, tag: string): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === tag
	);
}
// Beyond the tag, also check for a couple of members the real class always
// has: `Symbol.toStringTag` is otherwise just an own/inherited property, so
// an unrelated object could set it to have its (possibly side-effecting)
// getters/methods invoked while being converted.
function isHeadersLike(value: unknown): value is Headers {
	return (
		hasStringTag(value, "Headers") &&
		typeof (value as Headers).entries === "function" &&
		typeof (value as Headers).get === "function"
	);
}
function isRequestLike(value: unknown): value is Request {
	return (
		hasStringTag(value, "Request") &&
		typeof (value as Request).method === "string" &&
		isHeadersLike((value as Request).headers)
	);
}
function isResponseLike(value: unknown): value is Response {
	return (
		hasStringTag(value, "Response") &&
		typeof (value as Response).status === "number" &&
		isHeadersLike((value as Response).headers)
	);
}

/**
 * Converts `Headers`, `Request`s and `Response`s from other implementations
 * (e.g. Miniflare's `undici` classes) to Node's globals, the only ones Cap'n Web
 * can serialise.
 *
 * @param value Value about to be sent over Cap'n Web
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
		// Cap'n Web sends `cf` if present (e.g. for `cf.cacheKey`)
		if (value.cf !== undefined) {
			Object.defineProperty(request, "cf", { value: value.cf });
		}
		return request;
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

/**
 * Converts Node's global `Headers`, `Request`s and `Response`s, which Cap'n Web
 * returns, to Miniflare's classes.
 *
 * @param value Value received over Cap'n Web
 * @returns Equivalent Miniflare instance, or `undefined` if `value` isn't one
 * of these types
 */
function fromGlobalHTTPObject(value: unknown): object | undefined {
	if (value instanceof globalThis.Headers) {
		return new Headers([...value.entries()]);
	}
	if (value instanceof globalThis.Request) {
		return new Request(value.url, {
			method: value.method,
			headers: [...value.headers.entries()],
			body: value.body as ReadableStream | null,
			redirect: value.redirect,
			duplex: value.body === null ? undefined : "half",
		});
	}
	if (value instanceof globalThis.Response) {
		return new Response(value.body as ReadableStream | null, {
			status: value.status,
			statusText: value.statusText,
			headers: [...value.headers.entries()],
		});
	}
}

// Cap'n Web stub for `ProxyServer`'s main interface. Methods return
// `RpcPromise`s, so calls can be pipelined on the results without awaiting
// them.
type ProxyRpcStub = {
	[K in keyof ProxyRpcApi]: (
		...args: Parameters<ProxyRpcApi[K]>
	) => RpcPromise<unknown>;
} & Disposable;

// Cap'n Web stub, or promise, for a `Forwarder` in `ProxyServer`
interface ForwarderStub extends Disposable {
	get(path: string[]): RpcPromise<unknown>;
	call(path: string[], args: unknown[]): RpcPromise<unknown>;
	getFetcherToken(path: string[]): RpcPromise<string | undefined>;
}

// Cap'n Web session with `ProxyServer`
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
			{
				limits: { maxMessageSize: Infinity },
				onSendError: prepareErrorForSend,
			}
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
	#cachesProxy?: object;
	get caches(): object {
		return (this.#cachesProxy ??= this.#bridge.createProxy(
			new BindingStubSource(this.#bridge, "CacheStorage", (api) =>
				api.getCaches()
			),
			[],
			{ callable: false }
		));
	}
	get env(): Record<string, unknown> {
		return this.#bridge.env;
	}

	poisonProxies(): void {
		this.#bridge.poisonProxies();
		// Reset `#cachesProxy` so it isn't poisoned on next access
		this.#cachesProxy = undefined;
	}

	/**
	 * Resolves once the bindings in `env` are known, and synchronous calls can
	 * be served without blocking the main thread on worker startup.
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
		// Intentionally not resetting `#cachesProxy` to keep it poisoned.
		// `workerd` won't be started again by this `Miniflare` instance after
		// `dispose()` is called.
		return this.#bridge.dispose();
	}
}

// Where proxies get the Cap'n Web stub they forward to
abstract class StubSource {
	readonly #version: number;

	constructor(
		readonly bridge: ProxyClientBridge,
		// Name of the target's class, if known, for inspecting
		readonly name?: string
	) {
		this.#version = bridge.version;
	}

	get poisoned(): boolean {
		return this.#version !== this.bridge.version;
	}

	/** Throws if the stub can no longer be used. */
	assertUsable(): void {
		if (this.poisoned) {
			throw poisonedError();
		}
	}

	/** Returns the stub, throwing if it can no longer be used. */
	abstract stub(): ForwarderStub;
}

// Stub for a binding, got again by name if the connection is lost
class BindingStubSource extends StubSource {
	#session?: ProxyRpcSession;
	#stub?: ForwarderStub;

	constructor(
		bridge: ProxyClientBridge,
		name: string,
		readonly getStub: (api: ProxyRpcStub) => unknown
	) {
		super(bridge, name);
	}

	stub(): ForwarderStub {
		this.assertUsable();
		const session = this.bridge.session;
		if (this.#session !== session || this.#stub === undefined) {
			this.#session = session;
			this.#stub = this.getStub(session.api) as ForwarderStub;
		}
		return this.#stub;
	}
}

// Stub received over a session, released once no longer used
class OwnedStubSource extends StubSource {
	readonly #session: ProxyRpcSession | undefined;
	readonly #stub: ForwarderStub;

	constructor(
		bridge: ProxyClientBridge,
		// Undefined if the stub was received after proxies were poisoned
		session: ProxyRpcSession | undefined,
		stub: ForwarderStub
	) {
		super(bridge);
		this.#session = session;
		this.#stub = stub;
	}

	assertUsable(): void {
		super.assertUsable();
		if (this.#session?.closed !== false) {
			throw connectionLostError();
		}
	}

	stub(): ForwarderStub {
		this.assertUsable();
		return this.#stub;
	}
}

interface ProxyOptions {
	// Whether the proxy can be called, so its target must be a function
	callable?: boolean;
	// Whether the proxy can be awaited (e.g. a call's result, or a property)
	thenable?: boolean;
	// Properties implemented by the client, used instead of the target's
	local?: object;
}

// Class containing functions that should be accessible by both `ProxyClient`
// and proxy handlers, but not exported to consumers of `ProxyClient`
class ProxyClientBridge {
	// Each proxy is initialised with the version stored here. Whenever
	// `poisonProxies()` is called, this version is incremented. Before the
	// proxy is used, it checks the version number here matches its own internal
	// version, and throws if not.
	#version = 0;
	// Stubs returned by `ProxyServer` are released when the proxies using them
	// are garbage collected. All are unregistered when proxies are poisoned, as
	// the session they belong to is closed.
	readonly #finalizationRegistry = new FinalizationRegistry<Disposable>(
		(stub) => stub[Symbol.dispose]()
	);
	readonly #proxies = new WeakMap<object, RpcProxyHandler>();
	#session?: ProxyRpcSession;
	#env?: { version: number; value: Record<string, unknown> };

	readonly sync = new SynchronousFetcher();
	readonly codec = new ClientCodec(this);

	constructor(
		public url: URL,
		readonly dispatchFetch: DispatchFetch
	) {}

	get version(): number {
		return this.#version;
	}

	get session(): ProxyRpcSession {
		if (this.#session === undefined || this.#session.closed) {
			this.#session = new ProxyRpcSession(this.url);
		}
		return this.#session;
	}

	/** Session stubs are currently received over, without opening one. */
	get activeSession(): ProxyRpcSession | undefined {
		return this.#session;
	}

	get env(): Record<string, unknown> {
		assert(this.#env !== undefined, "Expected `warm()` to be awaited");
		if (this.#env.version !== this.#version) {
			throw poisonedError();
		}
		return this.#env.value;
	}

	async warm(): Promise<void> {
		await Promise.all([this.#loadEnv(), this.sync.warm()]);
	}

	async #loadEnv(): Promise<void> {
		const version = this.#version;
		if (this.#env?.version === version) {
			return;
		}
		const types = (await this.session.api.describeEnv()) as Record<
			string,
			string
		>;
		const value: Record<string, unknown> = {};
		for (const [name, type] of Object.entries(types)) {
			// Create proxies lazily, so they're only created for bindings used
			let binding: unknown;
			Object.defineProperty(value, name, {
				get: () => (binding ??= this.#createBinding(name, type)),
				enumerable: true,
			});
		}
		this.#env = { version, value };
	}

	#createBinding(name: string, type: string): unknown {
		const source = new BindingStubSource(this, type, (api) => api.getEnv(name));
		let local: object | undefined;
		switch (type) {
			case "DurableObjectNamespace":
				local = createDurableObjectNamespaceMethods(this, name, source);
				break;
			case "D1Database":
				local = {
					withSession: (constraint?: string) => {
						source.assertUsable();
						// Identifies the session when getting its bookmark
						const token = crypto.randomUUID();
						const session = this.session;
						const stub = session.api.getD1Session(name, constraint, token);
						return this.createProxy(
							this.ownStub(session, stub as unknown as ForwarderStub),
							[],
							{
								callable: false,
								local: {
									getBookmark: () =>
										this.syncCall({
											type: "D1DatabaseSession#getBookmark",
											binding: name,
											constraint,
											token,
										}),
								},
							}
						);
					},
				};
				break;
			case "R2Bucket":
				local = {
					resumeMultipartUpload: (key: string, uploadId: string) => {
						const result = source
							.stub()
							.call(
								["resumeMultipartUpload"],
								this.encodeArgs([key, uploadId])
							);
						// Pipeline calls on the result, as its data is known
						return this.createProxy(
							this.ownStub(this.session, result as unknown as ForwarderStub),
							[],
							{ callable: false, local: { key, uploadId } }
						);
					},
				};
				break;
			case "LocalAnalyticsEngineDataset":
				local = {
					writeDataPoint: (event?: unknown) => {
						// Like `workerd`, return without waiting for the data point to be
						// written, then release the result, which will never be used
						const result = source
							.stub()
							.call(["writeDataPoint"], this.encodeArgs([event]));
						result[Symbol.dispose]();
					},
				};
				break;
		}
		return this.createProxy(source, [], { callable: false, local });
	}

	/**
	 * Creates a proxy forwarding gets and calls to a stub.
	 *
	 * @param source Where to get the stub from
	 * @param path Path of the property on the stub's target to forward to
	 * @param options Options for the proxy
	 */
	createProxy(
		source: StubSource,
		path: string[],
		options: ProxyOptions = {}
	): object {
		const handler = new RpcProxyHandler(this, source, path, options);
		type ProxyTarget = object & { [util.inspect.custom]?: unknown };
		const target: ProxyTarget = options.callable === false ? {} : () => {};
		// `util.inspect()` inspects the target directly, rather than the `Proxy`
		target[util.inspect.custom] = handler.inspect;
		const proxy = new Proxy(target, handler);
		this.#proxies.set(proxy, handler);
		return proxy;
	}

	/**
	 * @param value Value that may be a proxy
	 * @returns The handler for `value`, if it's a proxy created by this bridge
	 */
	getProxyHandler(value: object): RpcProxyHandler | undefined {
		return this.#proxies.get(value);
	}

	/**
	 * Takes ownership of a stub received over `session`, releasing it once the
	 * proxies using it are garbage collected.
	 *
	 * @param session Session `stub` was received over
	 * @param stub Cap'n Web stub, or promise for a call's result
	 */
	ownStub(
		session: ProxyRpcSession | undefined,
		stub: ForwarderStub
	): OwnedStubSource {
		const source = new OwnedStubSource(this, session, stub);
		this.#finalizationRegistry.register(source, stub, this);
		return source;
	}

	/**
	 * Encodes a value to send to `ProxyServer`.
	 *
	 * @param value Value to send (e.g. a call's arguments)
	 */
	encode(value: unknown): unknown {
		const state: EncodeState = { inlineSize: 0 };
		const encoded = this.codec.encode(value, state);
		assertInlineSize(state);
		return encoded;
	}

	/**
	 * Encodes arguments for a call over Cap'n Web.
	 *
	 * @param args Arguments passed by the user
	 */
	encodeArgs(args: unknown[]): unknown[] {
		return this.encode(args) as unknown[];
	}

	/**
	 * Gets a value a synchronous API must return, blocking the main thread.
	 *
	 * @param request What to get
	 */
	syncCall(request: ProxySyncRequest): unknown {
		const res = this.sync.fetch(this.url, {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: PROXY_SECRET_HEX,
				[CoreHeaders.OP]: ProxyOps.SYNC,
			},
			body: JSON.stringify(request),
		});
		assert(res.status === 200);
		return JSON.parse(DECODER.decode(res.body));
	}

	/**
	 * Calls `fetch()` on a stub's target. If it's a `Fetcher` or Durable Object
	 * stub, this is sent with `dispatchFetch()` (see `ProxyOps.FETCH`).
	 *
	 * @param source Source of the stub
	 * @param path Path of the property on the stub's target to call `fetch()` on
	 * @param args Arguments passed to `fetch()`
	 */
	async fetch(
		source: StubSource,
		path: string[],
		args: unknown[]
	): Promise<unknown> {
		const stub = source.stub();
		const token = await stub.getFetcherToken(path);
		if (token === undefined) {
			// Call any other `fetch()` method like other methods
			const result = stub.call(
				[...path, "fetch"],
				this.encodeArgs(args)
			) as unknown as ForwarderStub;
			try {
				return await this.codec.decode(await result.get([]));
			} finally {
				result[Symbol.dispose]();
			}
		}

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
		request.headers.set(CoreHeaders.OP, ProxyOps.FETCH);
		request.headers.set(CoreHeaders.OP_TARGET, token);
		return this.dispatchFetch(request);
	}

	poisonProxies(): void {
		this.#version++;
		// This function will be called whenever `setOptions()` or `dispose()` is
		// called. The session is closed, so its stubs don't need releasing.
		this.#finalizationRegistry.unregister(this);
		this.#session?.dispose();
		this.#session = undefined;
	}

	dispose(): Promise<void> {
		this.poisonProxies();
		return this.sync.dispose();
	}
}

class ClientCodec extends ProxyCodec {
	constructor(readonly bridge: ProxyClientBridge) {
		super();
	}

	protected encodeSpecial(value: object): unknown {
		const handler = this.bridge.getProxyHandler(value);
		if (handler !== undefined) {
			// Like Workers RPC, properties can't be sent without awaiting them
			if (handler.path.length > 0) {
				throw new DOMException(
					'Could not serialize object of type "RpcProperty". This type does not support serialization.',
					"DataCloneError"
				);
			}
			return { [PROXY_ENCODED_KEY]: "Stub", value: handler.source.stub() };
		}
		if (value instanceof DurableObjectId) {
			return { [PROXY_ENCODED_KEY]: "DurableObjectId", value: value[kId] };
		}
		return toGlobalHTTPObject(value);
	}

	protected encodeReference(value: object): unknown {
		if (typeof value !== "function") {
			// Cap'n Web throws when serialising this
			return value;
		}
		// Callbacks, which `ProxyServer` may pass values to
		return async (...args: unknown[]) => {
			const decodedArgs = (await this.decode(args)) as unknown[];
			return this.bridge.encode(await value(...decodedArgs));
		};
	}

	protected decodeStub(stub: RpcStub<never>): unknown {
		const bridge = this.bridge;
		return bridge.createProxy(
			bridge.ownStub(bridge.activeSession, stub as unknown as ForwarderStub),
			[]
		);
	}

	protected async decodeSpecial(encoded: ProxyEncoded): Promise<unknown> {
		const type = encoded[PROXY_ENCODED_KEY];
		const value = await this.decode(encoded.value);
		switch (type) {
			case "R2Object":
				return new R2Object(value as R2ObjectData);
			case "R2ObjectBody":
				return new R2ObjectBody(value as R2ObjectBodyData);
			case "R2MultipartUpload":
			case "WorkflowInstance": {
				const bridge = this.bridge;
				const stub = encoded.stub as ForwarderStub;
				return bridge.createProxy(
					bridge.ownStub(bridge.activeSession, stub),
					[],
					{
						callable: false,
						local: value as object,
					}
				);
			}
			case "ImageTransformationResult": {
				const { contentType, image } = value as {
					contentType: string;
					image: ReadableStream;
				};
				return {
					contentType: () => contentType,
					image: () => image,
					response: () =>
						new Response(image, { headers: { "Content-Type": contentType } }),
				};
			}
		}
		assert.fail(`Unexpected encoded value type: ${type}`);
	}

	decode(value: unknown): Promise<unknown> {
		// Cap'n Web revives `Uint8Array`s as Node.js `Buffer`s
		if (Buffer.isBuffer(value)) {
			return Promise.resolve(
				new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
			);
		}
		const httpObject = fromGlobalHTTPObject(value);
		if (httpObject !== undefined) {
			return Promise.resolve(httpObject);
		}
		return super.decode(value);
	}
}

// Proxy handler forwarding gets and calls to a stub, for both native bindings
// and objects that speak Workers RPC. Everything is sent over Cap'n Web, so
// these never block the main thread.
class RpcProxyHandler implements ProxyHandler<object> {
	#settled?: Promise<unknown>;

	constructor(
		readonly bridge: ProxyClientBridge,
		readonly source: StubSource,
		readonly path: string[],
		readonly options: ProxyOptions
	) {}

	inspect = (_depth: number, options: util.InspectOptions) => {
		const name = [this.source.name, ...this.path]
			.filter((part) => part !== undefined)
			.join(".");
		const details = { name: name || undefined, poisoned: this.source.poisoned };
		return `ProxyStub ${util.inspect(details, options)}`;
	};

	#settle(): Promise<unknown> {
		return (this.#settled ??= this.#resolve());
	}
	async #resolve(): Promise<unknown> {
		try {
			const value = await this.source.stub().get(this.path);
			return await this.bridge.codec.decode(value);
		} catch (e) {
			restoreErrorName(e);
			if (typeof e === "object" && e !== null) {
				// Update the stack trace to include the calling location in Node
				// (as opposed to inside the proxy server) which is much more useful
				// for debugging. Specifying `#resolve` here hides our internal
				// implementation functions from the stack.
				Error.captureStackTrace(e, this.#resolve);
			}
			throw e;
		}
	}

	get(_target: object, key: string | symbol) {
		if (key === util.inspect.custom) {
			return this.inspect;
		}
		this.source.assertUsable();

		const local = this.options.local;
		if (local !== undefined && Object.hasOwn(local, key)) {
			return (local as Record<string | symbol, unknown>)[key];
		}
		if (this.options.thenable) {
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
		if (
			key === Symbol.dispose &&
			this.path.length === 0 &&
			this.source instanceof OwnedStubSource
		) {
			const stub = this.source.stub();
			return () => stub[Symbol.dispose]();
		}
		// Ignore all other symbol properties, or `then()`s of stubs, which
		// shouldn't be thenable
		if (typeof key === "symbol" || key === "then") {
			return undefined;
		}
		return this.bridge.createProxy(this.source, [...this.path, key], {
			thenable: true,
		});
	}

	apply(_target: object, _thisArg: unknown, args: unknown[]) {
		if (this.path[this.path.length - 1] === "fetch") {
			return this.bridge.fetch(this.source, this.path.slice(0, -1), args);
		}
		const stub = this.source.stub();
		const session = this.bridge.session;
		const result = stub.call(this.path, this.bridge.encodeArgs(args));
		return this.bridge.createProxy(
			this.bridge.ownStub(session, result as unknown as ForwarderStub),
			[],
			{ thenable: true }
		);
	}
}

const kId = Symbol("kId");

// `DurableObjectId` created in Node.js. Created from the arguments passed to
// the namespace, which `ProxyServer` revives it from.
class DurableObjectId {
	readonly #bridge: ProxyClientBridge;
	readonly #binding: string;
	readonly #id: ProxyDurableObjectId;
	#string?: string;

	constructor(
		bridge: ProxyClientBridge,
		binding: string,
		id: ProxyDurableObjectId
	) {
		this.#bridge = bridge;
		this.#binding = binding;
		this.#id = id;
	}

	get [kId](): [string, ProxyDurableObjectId] {
		return [this.#binding, this.#id];
	}

	get name(): string | undefined {
		const [kind, value] = this.#id;
		return kind === "name" ? value : undefined;
	}

	toString(): string {
		const [kind, value] = this.#id;
		if (kind === "string") {
			return value;
		}
		return (this.#string ??= this.#bridge.syncCall({
			type: "DurableObjectId#toString",
			binding: this.#binding,
			id: this.#id,
		}) as string);
	}

	equals(other: DurableObjectId): boolean {
		return (
			other instanceof DurableObjectId && this.toString() === other.toString()
		);
	}
}

/**
 * Creates the methods of a Durable Object namespace implemented by the client.
 * IDs are created locally, as their methods are synchronous.
 *
 * @param bridge Bridge to create stubs with
 * @param binding Name of the namespace binding
 * @param source Source of the stub for the namespace
 */
function createDurableObjectNamespaceMethods(
	bridge: ProxyClientBridge,
	binding: string,
	source: StubSource
): object {
	const get = (id: DurableObjectId, options?: unknown) => {
		if (!(id instanceof DurableObjectId)) {
			throw new TypeError(
				"Failed to execute 'get' on 'DurableObjectNamespace': parameter 1 is not of type 'DurableObjectId'."
			);
		}
		const session = bridge.session;
		const result = source
			.stub()
			.call(["get"], bridge.encodeArgs([id, options]));
		return bridge.createProxy(
			bridge.ownStub(session, result as unknown as ForwarderStub),
			[],
			{ callable: false, local: { id, name: id.name } }
		);
	};
	return {
		idFromName: (name: string) =>
			new DurableObjectId(bridge, binding, ["name", name]),
		idFromString: (id: string) => {
			// Validate the format locally, so invalid IDs still throw synchronously
			if (!/^[0-9a-f]{64}$/i.test(id)) {
				throw new TypeError("Invalid Durable Object ID: must be 64 hex digits");
			}
			return new DurableObjectId(bridge, binding, ["string", id.toLowerCase()]);
		},
		newUniqueId: (options?: unknown) =>
			new DurableObjectId(bridge, binding, [
				"string",
				bridge.syncCall({
					type: "DurableObjectNamespace#newUniqueId",
					binding,
					options,
				}) as string,
			]),
		get,
		getByName: (name: string, options?: unknown) =>
			get(new DurableObjectId(bridge, binding, ["name", name]), options),
	};
}

type R2ObjectData = Record<string, unknown> & {
	httpMetadata?: Record<string, unknown>;
	checksums: Record<string, ArrayBuffer | undefined>;
};
type R2ObjectBodyData = R2ObjectData & {
	size: number;
	range?: { length?: number };
	body: ReadableStream;
};

const R2_CHECKSUM_NAMES = ["md5", "sha1", "sha256", "sha384", "sha512"];

// `R2Checksums` returned by `ProxyServer` with its data
class R2Checksums {
	constructor(data: Record<string, ArrayBuffer | undefined>) {
		Object.assign(this, data);
	}

	toJSON(): Record<string, string> {
		const checksums = this as unknown as Record<
			string,
			ArrayBuffer | undefined
		>;
		const result: Record<string, string> = {};
		for (const name of R2_CHECKSUM_NAMES) {
			const checksum = checksums[name];
			if (checksum !== undefined) {
				result[name] = Buffer.from(checksum).toString("hex");
			}
		}
		return result;
	}
}

// `R2Object` returned by `ProxyServer` with its data
class R2Object {
	constructor(data: R2ObjectData) {
		Object.assign(this, data, { checksums: new R2Checksums(data.checksums) });
	}

	writeHttpMetadata(headers: Headers): void {
		const metadata = (this as unknown as R2ObjectData).httpMetadata ?? {};
		const headerNames: Record<string, string> = {
			contentType: "Content-Type",
			contentLanguage: "Content-Language",
			contentDisposition: "Content-Disposition",
			contentEncoding: "Content-Encoding",
			cacheControl: "Cache-Control",
		};
		for (const [key, name] of Object.entries(headerNames)) {
			const value = metadata[key];
			if (typeof value === "string") {
				headers.set(name, value);
			}
		}
		if (metadata.cacheExpiry instanceof Date) {
			headers.set("Expires", metadata.cacheExpiry.toUTCString());
		}
	}
}

// `R2ObjectBody` returned by `ProxyServer` with its data and body
class R2ObjectBody extends R2Object {
	readonly #body: ReadableStream;

	constructor({ body, ...data }: R2ObjectBodyData) {
		super(data);
		this.#body = body;
		// Allows the body to be put back to R2
		setStreamLength(body, data.range?.length ?? data.size);
	}

	get body(): ReadableStream {
		return this.#body;
	}
	get bodyUsed(): boolean {
		return Readable.isDisturbed(this.#body as unknown as NodeJS.ReadableStream);
	}

	arrayBuffer(): Promise<ArrayBuffer> {
		return arrayBuffer(this.#body);
	}
	async bytes(): Promise<Uint8Array> {
		return new Uint8Array(await arrayBuffer(this.#body));
	}
	text(): Promise<string> {
		return text(this.#body);
	}
	json<T>(): Promise<T> {
		return json(this.#body) as Promise<T>;
	}
	async blob(): Promise<Blob> {
		const type = (this as unknown as R2ObjectData).httpMetadata?.contentType;
		return new Blob([await arrayBuffer(this.#body)], {
			type: typeof type === "string" ? type : "",
		});
	}
}
