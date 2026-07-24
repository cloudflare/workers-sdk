import { newWebSocketRpcSession } from "capnweb";
import type { SharedBindings } from "./constants";

/**
 * Common environment type for remote binding workers. The loopback service is
 * the only binding still passed via env (services can't travel through props);
 * the per-binding fields now arrive via `ctx.props` (see `RemoteBindingProps`).
 */
export type RemoteBindingEnv = {
	// Optional loopback service used to surface diagnostics back to the
	// Miniflare host (e.g. a Cloudflare Access block detected on the response
	// from the remote-bindings proxy server).
	[SharedBindings.MAYBE_SERVICE_LOOPBACK]?: Fetcher;
};

/**
 * Per-binding configuration supplied at runtime via `ctx.props`. This is what
 * lets a single remote-proxy client service serve many bindings.
 */
export type RemoteBindingProps = {
	remoteProxyConnectionString?: string;
	binding: string;
	cfTraceId?: string;
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
	loopback?: Fetcher
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
 * Clamp a WebSocket close reason to the protocol's 123-byte limit.
 *
 * `WebSocket.close(code, reason)` requires the reason to be at most 123 UTF-8
 * bytes. Slicing by JavaScript string length (UTF-16 code units) can both
 * overshoot the byte budget and split a multi-byte character, so truncate on a
 * UTF-8 byte boundary instead.
 */
function truncateCloseReason(reason: string): string {
	const bytes = new TextEncoder().encode(reason);
	if (bytes.length <= 123) {
		return reason;
	}
	// Back off to a UTF-8 character boundary: step left over any trailing
	// continuation bytes (10xxxxxx) so we never cut a multi-byte sequence.
	let end = 123;
	while (end > 0 && ((bytes[end] ?? 0) & 0b1100_0000) === 0b1000_0000) {
		end--;
	}
	return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Relay raw TCP bytes between a `connect()` socket and a WebSocket, in both
 * directions, propagating close and error state.
 *
 * Used to tunnel `binding.connect()` traffic through the remote-bindings proxy:
 * the local proxy client pipes the caller's inbound socket over a WebSocket to
 * the remote proxy server, which pipes it into the real binding's socket.
 *
 * The returned promise resolves once both directions have closed cleanly, and
 * rejects if either side errors. Rejecting lets the caller's `connect()` handler
 * surface the failure on its socket.
 *
 * Both directions are torn down together: when one side finishes — a WebSocket
 * close/error, or the socket reaching EOF / erroring — the opposite direction is
 * actively cancelled. The socket read is woken with `reader.cancel()` and the
 * WebSocket wait is settled directly, so neither a parked `reader.read()` nor a
 * never-arriving close event can leak the relay (and the underlying socket) for
 * the lifetime of the process.
 *
 * Note: WebSockets have no backpressure signal, so `socket.readable` is drained
 * as fast as it produces. Incoming WebSocket messages are written in order via a
 * serialised write chain. There is no TCP half-close: when either direction ends
 * the tunnel is torn down in full — the WebSocket is closed and the socket's
 * writable side is closed — rather than closing a single direction.
 */
export async function pipeSocketOverWebSocket(
	socket: Socket,
	ws: WebSocket
): Promise<void> {
	const writer = socket.writable.getWriter();
	const reader = socket.readable.getReader();

	let wsClosed = false;
	function closeWebSocket(code: number, reason?: string) {
		if (wsClosed) {
			return;
		}
		wsClosed = true;
		try {
			ws.close(
				code,
				reason === undefined ? undefined : truncateCloseReason(reason)
			);
		} catch {
			// Already closing/closed.
		}
	}

	// ws -> socket writes are serialised through this chain to preserve byte
	// order. The writable side is closed exactly once (guarded by `writerClosed`)
	// so both teardown paths below can invoke it idempotently.
	let writeChain = Promise.resolve();
	let writerClosed = false;
	function closeWriter(): Promise<void> {
		if (writerClosed) {
			return Promise.resolve();
		}
		writerClosed = true;
		return writeChain.then(() => writer.close());
	}

	// `fromWebSocket` settles from the ws close/error events, or is settled by the
	// socket -> ws direction once it has closed the ws itself (in which case no
	// inbound close event will arrive to settle it).
	let resolveFromWs!: () => void;
	let rejectFromWs!: (reason: unknown) => void;
	const fromWebSocket = new Promise<void>((resolve, reject) => {
		resolveFromWs = resolve;
		rejectFromWs = reject;
	});

	// WebSocket -> socket. Message events aren't awaited by the runtime, so writes
	// are serialised through the promise chain to preserve byte order.
	ws.addEventListener("message", (event) => {
		const chunk =
			typeof event.data === "string"
				? new TextEncoder().encode(event.data)
				: new Uint8Array(event.data);
		writeChain = writeChain
			.then(() => writer.write(chunk))
			.catch((error) => {
				// A socket write failed: tear the tunnel down rather than leaving the
				// rejection unhandled. Close the ws (1011), cancel the opposite read
				// direction, and reject so the caller sees the failure.
				closeWebSocket(
					1011,
					(error as Error)?.message ?? "socket write failed"
				);
				reader.cancel().catch(() => {});
				rejectFromWs(error);
			});
	});
	ws.addEventListener("close", (event) => {
		wsClosed = true;
		// Actively cancel the opposite direction so a parked `reader.read()` can't
		// keep the socket -> ws relay (and this whole pipe) alive forever.
		reader.cancel().catch(() => {});
		// Close code 1011 signals the remote end errored.
		if (event.code === 1011) {
			rejectFromWs(
				new Error(event.reason || "Remote tunnel closed with an error")
			);
			return;
		}
		// Flush any queued writes, then close the writable side so the caller sees
		// EOF.
		closeWriter().then(resolveFromWs, rejectFromWs);
	});
	ws.addEventListener("error", () => {
		wsClosed = true;
		reader.cancel().catch(() => {});
		rejectFromWs(new Error("Tunnel WebSocket errored"));
	});

	// socket -> WebSocket. On EOF close cleanly (1000); on read error close with
	// 1011 and reject so the caller sees the failure.
	const toWebSocket = (async () => {
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				// Re-check after the parked read: the ws may have closed while we were
				// waiting. If so, terminate quietly instead of erroring on `send`.
				if (wsClosed) {
					break;
				}
				ws.send(
					value.buffer.slice(
						value.byteOffset,
						value.byteOffset + value.byteLength
					)
				);
			}
			closeWebSocket(1000);
		} catch (error) {
			closeWebSocket(1011, (error as Error)?.message ?? "socket read failed");
			throw error;
		} finally {
			reader.releaseLock();
			// We closed (or observed the close of) the ws on this side, so no inbound
			// close event will arrive to settle `fromWebSocket`. Close the writable
			// side and settle it here; idempotent with the ws `close` handler above.
			closeWriter().then(resolveFromWs, rejectFromWs);
		}
	})();

	await Promise.all([toWebSocket, fromWebSocket]);
}

/**
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * Intercepts `.fetch()` to use plain HTTP; forwards other accesses to capnweb.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	metadata?: ProxyMetadata,
	cfTraceId?: string,
	loopback?: Fetcher
): Fetcher {
	const url = new URL(remoteProxyConnectionString);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("MF-Binding", bindingName);
	if (metadata) {
		for (const [key, value] of Object.entries(metadata)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}

	type ProxiedService = Omit<Service, "connect" | "fetch"> & {
		fetch: typeof fetch;
		connect: never;
	};
	const stub = newWebSocketRpcSession(url.href) as unknown as ProxiedService;

	const headers = metadata
		? new Headers(
				Object.entries(metadata).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				)
			)
		: undefined;

	return new Proxy<ProxiedService>(stub, {
		get(_, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					headers,
					cfTraceId,
					loopback
				);
			}
			return Reflect.get(stub, p);
		},
	});
}
