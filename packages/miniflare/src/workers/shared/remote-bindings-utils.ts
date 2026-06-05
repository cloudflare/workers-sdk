import { newWebSocketRpcSession } from "capnweb";
import type { SharedBindings } from "./constants";

/**
 * Common environment type for remote binding workers.
 */
export type RemoteBindingEnv = {
	remoteProxyConnectionString?: string;
	binding: string;
	cfTraceId?: string;
	// Cloudflare Access Service Token credentials. When set, these are attached
	// as CF-Access-Client-Id / CF-Access-Client-Secret headers to requests to
	// the remote-bindings proxy server so that both HTTP (`makeFetch`) and
	// WebSocket/capnweb (`makeRemoteProxyStub`) remote bindings pass through
	// Access policies protecting the workers.dev domain.
	accessClientId?: string;
	accessClientSecret?: string;
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
	accessClientId?: string,
	accessClientSecret?: string
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
		// Attach Cloudflare Access Service Token credentials so the request to
		// the remote-bindings proxy server (hosted on the workers.dev domain)
		// passes through any Access policy protecting it. Wrapped-fetcher
		// bindings such as AI, Vectorize, and Images route their
		// `fetcher.fetch()` calls through here, so without these headers they
		// fail with a 403/401 when the workers.dev domain is behind Access.
		if (accessClientId && accessClientSecret) {
			proxiedHeaders.set("CF-Access-Client-Id", accessClientId);
			proxiedHeaders.set("CF-Access-Client-Secret", accessClientSecret);
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
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * Intercepts `.fetch()` to use plain HTTP; forwards other accesses to capnweb.
 *
 * When Access service token credentials are provided, the capnweb WebSocket is
 * established via `fetch()` with the CF-Access-Client-Id / CF-Access-Client-Secret
 * headers so RPC-based bindings (e.g. Artifacts) pass through Access policies
 * protecting the workers.dev domain. The `.fetch()` path threads the same
 * credentials through to `makeFetch`.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	metadata?: ProxyMetadata,
	cfTraceId?: string,
	loopback?: Fetcher,
	accessClientId?: string,
	accessClientSecret?: string
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

	// Without Access credentials, hand capnweb the ws(s):// URL directly — it
	// upgrades via `new WebSocket(url)` (no header support needed). With Access
	// credentials, establish the WebSocket ourselves via a fetch() upgrade
	// against the http(s):// URL so the Access headers ride along, then hand the
	// connected socket to capnweb. RPC methods are async, so awaiting the
	// connected socket is transparent to callers (e.g. `await env.X.method()`).
	let resolvedStub: ProxiedService | undefined;
	let stubPromise: Promise<ProxiedService> | undefined;

	if (accessClientId && accessClientSecret) {
		// fetch() needs the http(s):// scheme; reuse the same query params.
		const httpUrl = new URL(wsUrl.href);
		httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
		stubPromise = connectWebSocketWithHeaders(httpUrl.href, {
			"CF-Access-Client-Id": accessClientId,
			"CF-Access-Client-Secret": accessClientSecret,
		}).then((ws) => {
			resolvedStub = newWebSocketRpcSession(ws) as unknown as ProxiedService;
			return resolvedStub;
		});
	} else {
		resolvedStub = newWebSocketRpcSession(
			wsUrl.href
		) as unknown as ProxiedService;
	}

	const headers = metadata
		? new Headers(
				Object.entries(metadata).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				)
			)
		: undefined;

	return new Proxy<ProxiedService>({} as ProxiedService, {
		get(_, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					headers,
					cfTraceId,
					loopback,
					accessClientId,
					accessClientSecret
				);
			}
			if (resolvedStub) {
				return Reflect.get(resolvedStub, p);
			}
			if (stubPromise) {
				// The capnweb stub is itself a Proxy whose properties are RPC
				// methods — they must be invoked as `stub[p](...args)` (calling
				// `.apply()`/`.call()` would be interpreted as a remote method
				// named "apply"/"call"). Return an async wrapper that awaits the
				// authenticated WebSocket upgrade, then dispatches the RPC call.
				return async (...args: unknown[]) => {
					const stub = (await stubPromise) as Record<
						string | symbol,
						(...a: unknown[]) => unknown
					>;
					return stub[p](...args);
				};
			}
			throwRemoteRequired(bindingName);
		},
	});
}
