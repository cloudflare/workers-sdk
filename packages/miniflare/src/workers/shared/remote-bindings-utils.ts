import { newWebSocketRpcSession, RpcSession } from "capnweb";
import type { SharedBindings } from "./constants";
import type { RpcTransport } from "capnweb";

/**
 * Common environment type for remote binding workers.
 */
export type RemoteBindingEnv = {
	remoteProxyConnectionString?: string;
	binding: string;
	cfTraceId?: string;
	// Opaque, JSON-encoded bag of extra headers attached to every request to the
	// remote-bindings proxy server (e.g. a Cloudflare Access service token —
	// `CF-Access-Client-Id` / `CF-Access-Client-Secret` — or a `cloudflared`
	// `Cookie: CF_Authorization=…`). Computed wrangler-side via
	// `getAccessHeaders()` and forwarded as a single binding so both the HTTP
	// (`makeFetch`) and WebSocket/capnweb (`makeRemoteProxyStub`) paths can pass
	// through Access policies protecting the workers.dev domain. The worker side
	// stays agnostic to the auth scheme.
	remoteProxyHeaders?: string;
	// Optional loopback service used to surface diagnostics back to the
	// Miniflare host (e.g. a Cloudflare Access block detected on the response
	// from the remote-bindings proxy server).
	[SharedBindings.MAYBE_SERVICE_LOOPBACK]?: Fetcher;
};

/** Headers sent alongside proxy requests to provide additional context. */
export type ProxyMetadata = {
	"MF-Dispatch-Namespace-Options"?: string;
};

/**
 * Throws a consistent error when a binding requires remote mode but isn't configured for it.
 */
export function throwRemoteRequired(bindingName: string): never {
	throw new Error(`Binding ${bindingName} needs to be run remotely`);
}

/**
 * Build a plain-text body for the Cloudflare Access block substitution
 * response. We replace the original Access HTML so that:
 *  - Bindings that propagate the response body into an error message (e.g.
 *    `env.AI.run()` → `InferenceUpstreamError: …`) get something readable
 *    instead of a wall of HTML.
 *  - Service-binding `.fetch()` callers that pipe the response back to a
 *    browser see the same actionable guidance as the terminal warning.
 *
 * The first line is the "headline" so error-message parsers that only show
 * the first line of the body still surface the key information.
 */
function buildAccessBlockResponseBody(
	bindingName: string,
	proxyUrl: string
): string {
	return [
		`Cloudflare Access blocked this remote bindings request (binding "${bindingName}").`,
		``,
		`The local remote-bindings proxy client tried to reach ${proxyUrl}, but the`,
		`remote workers.dev proxy server returned a Cloudflare Access block page.`,
		``,
		`If your Cloudflare account protects workers.dev with Access, set the`,
		`CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment`,
		`variables (Service Token credentials), or run`,
		`  cloudflared access login <your-workers.dev-host>`,
		`for interactive authentication.`,
		``,
		`See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/`,
	].join("\n");
}

/**
 * If the response from the remote-bindings proxy server is a Cloudflare Access
 * block page, report it to the Miniflare host via the loopback service so that
 * a single, actionable warning can be surfaced to the user. Also substitutes
 * the original HTML body for a readable plain-text body so that the warning
 * surfaces in error messages (for bindings that propagate the body) and in
 * browsers (for bindings whose response is piped back to the client).
 *
 * The remote-bindings proxy CLIENT worker only ever calls the
 * `remoteProxyConnectionString`, so a 403 with a Cloudflare Access body here
 * is unambiguously an Access block — never a user-worker 403.
 *
 * Dedup of the warning is performed on the Miniflare/Node side; the worker
 * just fires the loopback notification for every blocked request.
 */
async function maybeReportCloudflareAccessBlock(
	response: Response,
	bindingName: string,
	proxyUrl: string,
	loopback: Fetcher | undefined
): Promise<Response> {
	if (!loopback || response.status !== 403) {
		return response;
	}
	let text: string;
	try {
		text = await response.clone().text();
	} catch {
		return response;
	}
	// Cloudflare Access block pages reliably contain the literal string
	// "Cloudflare Access" in the HTML body (title: "Error ・ Cloudflare Access").
	// Combined with the 403 status and the fact that this worker only ever
	// calls the remote-bindings proxy URL, this is a low-false-positive signal.
	if (!text.includes("Cloudflare Access")) {
		return response;
	}
	await loopback.fetch("http://localhost/core/remote-bindings-access-warning", {
		method: "POST",
		headers: {
			"MF-Binding": bindingName,
			"MF-Proxy-URL": proxyUrl,
		},
	});
	// Replace the original Access HTML body with our own readable plain-text
	// guidance. Headers are not copied from the original response — they may
	// include Access-specific cookies and other artefacts that aren't relevant
	// to the synthesised body.
	return new Response(buildAccessBlockResponseBody(bindingName, proxyUrl), {
		status: response.status,
		statusText: response.statusText,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}

export function makeFetch(
	remoteProxyConnectionString: string | undefined,
	bindingName: string,
	extraHeaders?: Headers,
	cfTraceId?: string,
	loopback?: Fetcher,
	remoteProxyHeaders?: Record<string, string>
) {
	return async (
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> => {
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(bindingName);
		}
		const request = new Request(input, init);

		const proxiedHeaders = new Headers(extraHeaders);
		for (const [name, value] of request.headers) {
			// The `Upgrade` header needs to be special-cased to prevent:
			//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
			if (name === "upgrade") {
				proxiedHeaders.set(name, value);
			} else {
				proxiedHeaders.set(`MF-Header-${name}`, value);
			}
		}
		proxiedHeaders.set("MF-URL", request.url);
		proxiedHeaders.set("MF-Binding", bindingName);
		if (cfTraceId) {
			// Set directly on the outgoing request so Cloudflare's edge tracing picks it up
			proxiedHeaders.set("cf-trace-id", cfTraceId);
			// Also forward through to the binding call via the MF-Header proxy mechanism
			proxiedHeaders.set("MF-Header-cf-trace-id", cfTraceId);
		}
		// Attach any auth headers needed to reach the remote-bindings proxy
		// server (hosted on the workers.dev domain) so the request passes through
		// an Access policy protecting it. Wrapped-fetcher bindings such as AI,
		// Vectorize, and Images route their `fetcher.fetch()` calls through here,
		// so without these headers they fail with a 403/401 when the workers.dev
		// domain is behind Access. The bag is opaque (service-token pair or a
		// cookie), so we just spread it.
		if (remoteProxyHeaders) {
			for (const [name, value] of Object.entries(remoteProxyHeaders)) {
				proxiedHeaders.set(name, value);
			}
		}
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		const response = await fetch(remoteProxyConnectionString, req);
		// Awaited (rather than fire-and-forget) so the loopback POST isn't
		// cancelled when the proxy client returns. The happy path
		// (non-403) short-circuits before any body read or loopback call,
		// so this adds no latency to successful requests.
		return await maybeReportCloudflareAccessBlock(
			response,
			bindingName,
			remoteProxyConnectionString,
			loopback
		);
	};
}

/**
 * Open a WebSocket to the remote-bindings proxy server via `fetch()` with an
 * `Upgrade: websocket` header so that custom headers (e.g. Cloudflare Access
 * service token credentials) are included in the handshake.
 *
 * In the Workers runtime, `new WebSocket(url)` (which capnweb uses when given a
 * URL string) cannot set request headers, so when the proxy server is behind
 * Cloudflare Access the upgrade is rejected with a 401. Using `fetch()` against
 * the http(s) URL lets us attach the Access headers; the returned
 * `response.webSocket` is then handed to capnweb.
 */
async function connectWebSocketWithHeaders(
	httpUrl: string,
	headers: Record<string, string>
): Promise<WebSocket> {
	const resp = await fetch(httpUrl, {
		headers: { Upgrade: "websocket", ...headers },
	});
	const ws = resp.webSocket;
	if (!ws) {
		throw new Error(
			`Remote bindings WebSocket upgrade failed (HTTP ${resp.status}). ` +
				`If your workers.dev domain is protected by Cloudflare Access, ensure ` +
				`CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET are set ` +
				`to valid Service Token credentials.`
		);
	}
	ws.accept();
	return ws;
}

/**
 * A capnweb {@link RpcTransport} that establishes its WebSocket lazily via an
 * async `connect()` callback (a `fetch()`-based Upgrade, so custom headers ride
 * the handshake).
 *
 * capnweb's `newWebSocketRpcSession()` only accepts an already-open `WebSocket`
 * or a URL string (which it opens with `new WebSocket(url)` — no header support
 * in the Workers runtime). By implementing the transport ourselves we let
 * capnweb build the session and stub *synchronously* while the authenticated
 * upgrade completes in the background: sends are buffered until the socket
 * opens, and connection failures propagate to RPC callers through `receive()`,
 * per capnweb's documented transport contract. This keeps the proxy that wraps
 * the stub trivial (it only has to intercept `.fetch`), with no thenable guard
 * or lazy-stub bookkeeping.
 *
 * Mirrors capnweb's own (non-exported) `WebSocketTransport`, generalised to a
 * promised socket.
 */
class FetchWebSocketTransport implements RpcTransport {
	#socket?: WebSocket;
	#sendQueue: string[] = [];
	#receiveQueue: string[] = [];
	#receiveResolver?: (message: string) => void;
	#receiveRejecter?: (err: unknown) => void;
	#error?: unknown;
	#ready: Promise<void>;

	constructor(connect: () => Promise<WebSocket>) {
		this.#ready = connect().then(
			(webSocket) => this.#onOpen(webSocket),
			(err) => this.#receivedError(err)
		);
		// If neither `send()` nor `receive()` ever awaits `#ready` (e.g. only the
		// HTTP `.fetch()` path of the binding is used), a failed upgrade would
		// otherwise surface as an unhandled rejection. capnweb pumps `receive()`
		// immediately for an active session, so in practice the error is consumed
		// there; this guard just covers the never-used-as-RPC case.
		this.#ready.catch(() => {});
	}

	#onOpen(webSocket: WebSocket): void {
		// The session may have been aborted before the socket finished
		// connecting; don't wire up a socket nobody is listening to.
		if (this.#error !== undefined) {
			try {
				webSocket.close();
			} catch {
				// best-effort
			}
			return;
		}
		this.#socket = webSocket;
		webSocket.addEventListener("message", (event: MessageEvent) => {
			if (this.#error !== undefined) {
				return;
			}
			if (typeof event.data === "string") {
				if (this.#receiveResolver) {
					this.#receiveResolver(event.data);
					this.#receiveResolver = undefined;
					this.#receiveRejecter = undefined;
				} else {
					this.#receiveQueue.push(event.data);
				}
			} else {
				this.#receivedError(
					new TypeError("Received non-string message from WebSocket.")
				);
			}
		});
		webSocket.addEventListener("close", (event: CloseEvent) => {
			this.#receivedError(
				new Error(`Peer closed WebSocket: ${event.code} ${event.reason}`)
			);
		});
		webSocket.addEventListener("error", () => {
			this.#receivedError(new Error("WebSocket connection failed."));
		});
		try {
			for (const message of this.#sendQueue) {
				webSocket.send(message);
			}
		} catch (err) {
			this.#receivedError(err);
		}
		this.#sendQueue = [];
	}

	async send(message: string): Promise<void> {
		if (this.#error !== undefined) {
			throw this.#error;
		}
		if (this.#socket) {
			this.#socket.send(message);
		} else {
			// Buffer until the upgrade completes; `#onOpen` flushes in order.
			this.#sendQueue.push(message);
		}
	}

	async receive(): Promise<string> {
		if (this.#receiveQueue.length > 0) {
			return this.#receiveQueue.shift() as string;
		}
		if (this.#error !== undefined) {
			throw this.#error;
		}
		// Surface a slow or failed upgrade through `receive()`, which is where
		// capnweb expects transport errors to propagate (it rejects all
		// outstanding and future RPC calls).
		if (!this.#socket) {
			await this.#ready;
			if (this.#receiveQueue.length > 0) {
				return this.#receiveQueue.shift() as string;
			}
			if (this.#error !== undefined) {
				throw this.#error;
			}
		}
		return new Promise<string>((resolve, reject) => {
			this.#receiveResolver = resolve;
			this.#receiveRejecter = reject;
		});
	}

	abort(reason: unknown): void {
		if (this.#socket) {
			const message = reason instanceof Error ? reason.message : `${reason}`;
			try {
				this.#socket.close(3000, message);
			} catch {
				// best-effort
			}
		}
		if (this.#error === undefined) {
			this.#error = reason;
		}
	}

	#receivedError(reason: unknown): void {
		if (this.#error === undefined) {
			this.#error = reason;
			if (this.#receiveRejecter) {
				this.#receiveRejecter(reason);
				this.#receiveResolver = undefined;
				this.#receiveRejecter = undefined;
			}
		}
	}
}

/**
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * Intercepts `.fetch()` to use plain HTTP; forwards every other access to the
 * capnweb stub.
 *
 * When auth headers are provided (e.g. a Cloudflare Access service token), the
 * capnweb WebSocket is established through {@link FetchWebSocketTransport} via a
 * `fetch()` Upgrade so the headers ride the handshake — letting RPC bindings
 * (e.g. Artifacts) pass through Access policies protecting the workers.dev
 * domain. capnweb builds the stub synchronously either way, so the wrapping
 * proxy only needs to special-case `.fetch`; everything else (including the
 * `then === undefined` non-thenable behaviour) comes from the real stub. The
 * `.fetch()` path threads the same headers through to `makeFetch`.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	metadata?: ProxyMetadata,
	cfTraceId?: string,
	loopback?: Fetcher,
	remoteProxyHeaders?: Record<string, string>
): Fetcher {
	const wsUrl = new URL(remoteProxyConnectionString);
	wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
	wsUrl.searchParams.set("MF-Binding", bindingName);
	if (metadata) {
		for (const [key, value] of Object.entries(metadata)) {
			if (value !== undefined) {
				wsUrl.searchParams.set(key, value);
			}
		}
	}

	type ProxiedService = Omit<Service, "connect" | "fetch"> & {
		fetch: typeof fetch;
		connect: never;
	};

	// Without auth headers, hand capnweb the ws(s):// URL directly — it upgrades
	// via `new WebSocket(url)`. With headers — which `new WebSocket(url)` cannot
	// send in the Workers runtime — drive the upgrade ourselves through a custom
	// transport that does a `fetch()` Upgrade so the headers ride the handshake.
	// Either way capnweb returns a real stub synchronously.
	let stub: ProxiedService;
	if (remoteProxyHeaders && Object.keys(remoteProxyHeaders).length > 0) {
		// fetch() needs the http(s):// scheme; reuse the same query params.
		const httpUrl = new URL(wsUrl.href);
		httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
		const transport = new FetchWebSocketTransport(() =>
			connectWebSocketWithHeaders(httpUrl.href, remoteProxyHeaders)
		);
		stub = new RpcSession(transport).getRemoteMain() as unknown as ProxiedService;
	} else {
		stub = newWebSocketRpcSession(wsUrl.href) as unknown as ProxiedService;
	}

	const headers = metadata
		? new Headers(
				Object.entries(metadata).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				)
			)
		: undefined;

	return new Proxy<ProxiedService>(stub, {
		get(target, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					headers,
					cfTraceId,
					loopback,
					remoteProxyHeaders
				);
			}
			return Reflect.get(target, p);
		},
	});
}
