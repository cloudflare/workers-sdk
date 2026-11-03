import assert from "node:assert";
import { Buffer } from "node:buffer";
import { newWorkersWebSocketRpcResponse, RpcTarget } from "capnweb";
import * as workers from "cloudflare:workers";
import { reduceError } from "miniflare:shared";
import { CoreBindings, CoreHeaders, ProxyOps } from "./constants";
import {
	PROXY_ENCODED_KEY,
	prepareErrorForSend,
	ProxyCodec,
	restoreErrorName,
} from "./proxy-codec";
import type {
	ProxyDurableObjectId,
	ProxyRpcApi,
	ProxySyncRequest,
} from "./constants";
import type { ProxyEncoded } from "./proxy-codec";
import type { RpcStub } from "capnweb";

// Not declared by `@cloudflare/workers-types`
const { ServiceStub } = workers as unknown as {
	ServiceStub: abstract new (...args: never[]) => object;
};

const ALLOWED_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];

type Env = Record<string, unknown> & {
	[CoreBindings.DATA_PROXY_SECRET]: ArrayBuffer;
};

/**
 * @param value Object to get the class name of
 * @returns Name of `value`'s class. Read from its prototype, as accessing any
 * property of a Workers RPC stub (e.g. `constructor`) calls the remote object.
 */
function getClassName(value: object): string {
	return Object.getPrototypeOf(value)?.constructor?.name ?? "Object";
}

/**
 * @param value Value bound in the `ProxyServer`'s `env`
 * @returns Whether `value` must be used through a stub. Other bindings (e.g.
 * JSON) are provided in Node.js without the proxy.
 */
function isObjectBinding(value: unknown): value is object {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return (
		(proto !== Object.prototype && proto !== Array.prototype) ||
		Object.values(value).some((v) => typeof v === "function")
	);
}

/**
 * @param object `R2Object` or `R2ObjectBody`
 * @returns Data properties of `object`. These are all own properties, except
 * `checksums`, whose properties must be copied out of its class.
 */
function getR2ObjectData(object: R2Object): Record<string, unknown> {
	return { ...object, checksums: { ...object.checksums } };
}

/** Returned by `Forwarder#unwrap()`. Passed by reference by local calls. */
class Unwrapped {
	constructor(readonly target: unknown) {}
}

class ServerCodec extends ProxyCodec {
	constructor(readonly server: ProxyServer) {
		super();
	}

	protected encodeSpecial(value: object): unknown {
		// Objects returned with their data, so it can be accessed synchronously
		// by the client, which implements their synchronous methods itself
		switch (getClassName(value)) {
			// Internal names of `R2Object` and `R2ObjectBody`
			case "HeadResult":
				return this.#encodeWithData(
					"R2Object",
					getR2ObjectData(value as R2Object)
				);
			case "GetResult": {
				const object = value as R2ObjectBody;
				return this.#encodeWithData("R2ObjectBody", {
					...getR2ObjectData(object),
					body: object.body,
				});
			}
			case "R2MultipartUpload": {
				const upload = value as R2MultipartUpload;
				return this.#encodeWithData(
					"R2MultipartUpload",
					{ key: upload.key, uploadId: upload.uploadId },
					upload
				);
			}
			// Name of Workflow instances in Miniflare's Workflows binding
			case "InstanceImpl": {
				const instance = value as WorkflowInstance;
				return this.#encodeWithData(
					"WorkflowInstance",
					{ id: instance.id },
					instance
				);
			}
			// Name of results from Images binding transformations
			case "TransformationResultImpl": {
				const result = value as ImageTransformationResult;
				return this.#encodeWithData("ImageTransformationResult", {
					contentType: result.contentType(),
					image: result.image(),
				});
			}
		}
	}

	/**
	 * @param type Type of the object
	 * @param data Data of the object
	 * @param target Object to forward the client's calls to, if it has methods
	 * the client doesn't implement
	 */
	#encodeWithData(type: string, data: object, target?: object): ProxyEncoded {
		const encoded: ProxyEncoded = {
			[PROXY_ENCODED_KEY]: type,
			value: this.encode(data),
		};
		if (target !== undefined) {
			encoded.stub = new Forwarder(this.server, target);
		}
		return encoded;
	}

	protected encodeReference(value: object): unknown {
		return new Forwarder(this.server, value);
	}

	decode(value: unknown): Promise<unknown> {
		// Cap'n Web cancels streams received as arguments that haven't been read
		// by the time the call returns, but native methods may read them later
		// (e.g. `ImagesBinding#input()`)
		if (value instanceof ReadableStream) {
			return Promise.resolve(value.pipeThrough(new TransformStream()));
		}
		return super.decode(value);
	}

	protected decodeStub(stub: RpcStub<never>): unknown {
		// Stubs received from the client are functions it passed as callbacks.
		// Cap'n Web disposes them once the call returns, but Workers RPC lets the
		// callee keep them, then calls `Symbol.dispose` once it's released them.
		const callback = (stub as unknown as { dup(): typeof stub }).dup();
		const call = callback as unknown as (...args: unknown[]) => unknown;
		return Object.assign(
			async (...args: unknown[]) => {
				try {
					return await this.decode(
						await call(...(this.encode(args) as unknown[]))
					);
				} catch (e) {
					restoreErrorName(e);
					throw e;
				}
			},
			{ [Symbol.dispose]: () => (callback as Disposable)[Symbol.dispose]() }
		);
	}

	protected async decodeSpecial(encoded: ProxyEncoded): Promise<unknown> {
		const type = encoded[PROXY_ENCODED_KEY];
		switch (type) {
			// Objects the client got from us. Pass the objects themselves, rather
			// than stubs to them, so native methods accept them too.
			case "Stub": {
				const stub = encoded.value as RpcStub<Forwarder>;
				return ((await stub.unwrap()) as unknown as Unwrapped).target;
			}
			case "DurableObjectId": {
				const [binding, id] = encoded.value as [string, ProxyDurableObjectId];
				return this.getDurableObjectId(binding, id);
			}
			// Streams sent with their length, as some APIs (e.g. `R2Bucket#put()`)
			// reject streams without one
			case "Stream": {
				const [stream, length] = encoded.value as [ReadableStream, number];
				return stream.pipeThrough(new FixedLengthStream(length));
			}
		}
		assert.fail(`Unexpected encoded value type: ${type}`);
	}

	/**
	 * @param binding Name of the Durable Object namespace binding
	 * @param id How the ID was created by the client
	 * @returns The Durable Object ID
	 */
	getDurableObjectId(
		binding: string,
		[kind, value]: ProxyDurableObjectId
	): DurableObjectId {
		const namespace = this.server.env[binding] as DurableObjectNamespace;
		return kind === "name"
			? namespace.idFromName(value)
			: namespace.idFromString(value);
	}
}

/**
 * Cap'n Web target that forwards gets and calls to an object in `workerd`,
 * using the codec for arguments and results. Native bindings and objects that
 * speak Workers RPC are both used through this, so values have the same
 * fidelity for each. Objects it holds are released by garbage collection, once
 * the client has disposed its stubs to it.
 */
class Forwarder extends RpcTarget {
	readonly #server: ProxyServer;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Forwards arbitrary property accesses and calls
	readonly #target: any;
	readonly #onDispose?: () => void;
	// Resolves once the target has been called for the last call received.
	// Targets are called in the order calls arrive, like Workers RPC, even if
	// decoding arguments (e.g. reading large strings) takes longer for some.
	#called: Promise<void> = Promise.resolve();
	// Tokens for `fetch()` targets in `ProxyServer#fetchers`, by path
	readonly #fetcherTokens = new Map<string, string>();

	constructor(server: ProxyServer, target: unknown, onDispose?: () => void) {
		super();
		this.#server = server;
		this.#target = target;
		this.#onDispose = onDispose;
	}

	#follow(path: string[]): unknown {
		let value = this.#target;
		for (const key of path) {
			value = value[key];
		}
		return value;
	}

	async get(path: string[]): Promise<unknown> {
		await this.#called;
		return this.#server.codec.encode(await this.#follow(path));
	}

	/**
	 * Calls a method of the target. Returns the result in another `Forwarder`,
	 * so the client can pipeline calls on it whatever it is, then get it if it
	 * awaits it.
	 */
	async call(path: string[], args: unknown[]): Promise<Forwarder> {
		const decodedArgs = this.#server.codec.decode(args);
		// Wrapped, so awaiting this doesn't wait for the call's result
		const called = Promise.all([this.#called, decodedArgs]).then(
			([, args]) => ({ result: this.#invoke(path, args as unknown[]) })
		);
		this.#called = called.then(
			() => {},
			() => {}
		);
		const { result } = await called;
		return new Forwarder(this.#server, await result);
	}

	#invoke(path: string[], args: unknown[]): unknown {
		if (path.length === 0) {
			return this.#target(...args);
		}
		const parent = this.#follow(path.slice(0, -1)) as Record<string, unknown>;
		const method = parent[path[path.length - 1]];
		if (typeof method !== "function") {
			throw new TypeError(`${path.join(".")} is not a function`);
		}
		// Not `method.apply()`, as properties of Workers RPC stubs are remote
		return Reflect.apply(method, parent, args);
	}

	/**
	 * Gets a token for the target at `path` if it's a `Fetcher` or Durable
	 * Object stub, so the client can call its `fetch()` method with
	 * `dispatchFetch()` (see `ProxyOps.FETCH`).
	 */
	getFetcherToken(path: string[]): string | undefined {
		const key = JSON.stringify(path);
		let token = this.#fetcherTokens.get(key);
		if (token === undefined) {
			const target = this.#follow(path);
			if (!(target instanceof ServiceStub)) {
				return;
			}
			token = crypto.randomUUID();
			this.#server.fetchers.set(token, target as Fetcher);
			this.#fetcherTokens.set(key, token);
		}
		return token;
	}

	unwrap(): Unwrapped {
		return new Unwrapped(this.#target);
	}

	[Symbol.dispose](): void {
		for (const token of this.#fetcherTokens.values()) {
			this.#server.fetchers.delete(token);
		}
		this.#onDispose?.();
	}
}

/**
 * Cap'n Web main interface, used to get stubs for bindings.
 */
class ProxyRpc extends RpcTarget implements ProxyRpcApi {
	readonly #server: ProxyServer;

	constructor(server: ProxyServer) {
		super();
		this.#server = server;
	}

	describeEnv(): Record<string, string> {
		const types: Record<string, string> = {};
		for (const [name, value] of Object.entries(this.#server.env)) {
			if (isObjectBinding(value)) {
				types[name] = getClassName(value);
			}
		}
		return types;
	}

	getEnv(name: string): Forwarder {
		const value = this.#server.env[name];
		assert(isObjectBinding(value), `Expected ${name} to be an object`);
		return new Forwarder(this.#server, value);
	}

	getCaches(): Forwarder {
		return new Forwarder(this.#server, caches);
	}

	getD1Session(
		binding: string,
		constraint: string | undefined,
		token: string
	): Forwarder {
		const server = this.#server;
		const session = server.getD1Session(binding, constraint, token);
		return new Forwarder(server, session, () => server.deleteD1Session(token));
	}
}

// TODO(someday): extract `ProxyServer` into component that could be used by
//  other (user) Durable Objects
export class ProxyServer implements DurableObject {
	readonly codec = new ServerCodec(this);
	// `fetch()` targets, by the token the client identifies them with
	readonly fetchers = new Map<string, Fetcher>();
	// D1 sessions created by the client, by the token it identifies them with
	readonly #d1Sessions = new Map<string, D1DatabaseSession>();

	constructor(
		_state: DurableObjectState,
		readonly env: Env
	) {}

	/**
	 * Gets a D1 session for the client, creating it if this is the first
	 * request for `token`. Requests for its bookmark may arrive before the
	 * Cap'n Web call creating it, as they're sent on another connection.
	 */
	getD1Session(
		binding: string,
		constraint: string | undefined,
		token: string
	): D1DatabaseSession {
		let session = this.#d1Sessions.get(token);
		if (session === undefined) {
			session = (this.env[binding] as D1Database).withSession(constraint);
			this.#d1Sessions.set(token, session);
		}
		return session;
	}

	deleteD1Session(token: string): void {
		this.#d1Sessions.delete(token);
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
				onSendError: prepareErrorForSend,
			});
		}
		if (opHeader === ProxyOps.SYNC) {
			return Response.json(this.#sync(await request.json()));
		}
		if (opHeader === ProxyOps.FETCH) {
			return this.#fetchTarget(request);
		}
		return new Response(null, { status: 400 });
	}

	#sync(request: ProxySyncRequest): unknown {
		switch (request.type) {
			case "DurableObjectId#toString":
				return this.codec
					.getDurableObjectId(request.binding, request.id)
					.toString();
			case "DurableObjectNamespace#newUniqueId": {
				const namespace = this.env[request.binding] as DurableObjectNamespace;
				return namespace
					.newUniqueId(
						request.options as DurableObjectNamespaceNewUniqueIdOptions
					)
					.toString();
			}
			case "D1DatabaseSession#getBookmark":
				return this.getD1Session(
					request.binding,
					request.constraint,
					request.token
				).getBookmark();
		}
	}

	#fetchTarget(request: Request) {
		const token = request.headers.get(CoreHeaders.OP_TARGET);
		const fetcher = token === null ? undefined : this.fetchers.get(token);
		if (fetcher === undefined) {
			return new Response(null, { status: 400 });
		}

		const originalUrl =
			request.headers.get(CoreHeaders.OP_ORIGINAL_URL) ??
			request.headers.get(CoreHeaders.ORIGINAL_URL);
		const url = new URL(originalUrl ?? request.url);
		// Create a new request to allow header mutation and use original URL
		request = new Request(url, request);
		request.headers.delete(CoreHeaders.OP_SECRET);
		request.headers.delete(CoreHeaders.OP);
		request.headers.delete(CoreHeaders.OP_TARGET);
		request.headers.delete(CoreHeaders.OP_ORIGINAL_URL);
		request.headers.delete(CoreHeaders.ORIGINAL_URL);
		request.headers.delete(CoreHeaders.DISABLE_PRETTY_ERROR);
		return fetcher.fetch(request);
	}
}
