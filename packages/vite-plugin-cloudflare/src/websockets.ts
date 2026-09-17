import { createHeaders } from "@remix-run/node-fetch-server";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import { getForwardedProto } from "./utils";
import type { Headers, Miniflare } from "miniflare";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import type * as vite from "vite";

/**
 * Handles 'upgrade' requests to the Vite HTTP server and forwards WebSocket events between the client and Worker environments.
 */
export function handleWebSocket(
	httpServer: vite.HttpServer,
	miniflare: Miniflare,
	entryWorkerName?: string
) {
	const nodeWebSocket = new WebSocketServer({ noServer: true });

	// Stash Worker 101-response headers keyed by the upgrade request so a single
	// persistent `headers` listener can apply them when `ws` emits the upgrade
	// response. Matches the pattern in `packages/miniflare/src/index.ts`.
	//
	// Using `once()` per upgrade is unsafe: if `ws.handleUpgrade` aborts before
	// emitting `headers` (e.g. malformed `Sec-WebSocket-Key`/`Sec-WebSocket-
	// Version`), the listener stays attached and fires on the next successful
	// upgrade with stale headers leaked from the previous Worker response. The
	// WeakMap entry is GC'd if the request never completes.
	const workerResponseHeaders = new WeakMap<IncomingMessage, Headers>();

	// Upgrade sockets this handler leaves unanswered (another listener may
	// own them) stay pending on the server: Node reaps neither them on
	// close() nor on closeAllConnections(), so one rejected, unclaimed
	// upgrade would hang server shutdown forever. Track such sockets and
	// destroy them when close() is initiated. Destroying here races no one:
	// the server is going down, and claimed sockets are never tracked.
	const pendingUpgrades = new Set<Duplex>();
	const trackUnresolved = (socket: Duplex) => {
		const netSocket = socket as unknown as Socket;
		if (socket.destroyed || netSocket.closed) {
			return;
		}
		pendingUpgrades.add(socket);
		socket.once("close", () => {
			pendingUpgrades.delete(socket);
		});
	};
	const serverClose = httpServer.close.bind(httpServer);
	httpServer.close = ((callback?: (err?: Error) => void) => {
		for (const pending of pendingUpgrades) {
			pending.destroy();
		}
		pendingUpgrades.clear();
		return serverClose(callback as never);
	}) as typeof httpServer.close;

	nodeWebSocket.on(
		"headers",
		(responseHeaders: string[], request: IncomingMessage) => {
			const extra = workerResponseHeaders.get(request);
			workerResponseHeaders.delete(request);
			if (extra) {
				appendWorkerResponseHeaders(responseHeaders, extra);
			}
		}
	);

	// Node dispatches `upgrade` to *every* registered listener, not just the
	// first, so another listener (e.g. Vite DevTools at `/__devtools/__ws`) may
	// own a socket we don't. We must never tear down a socket someone else
	// claimed. Prepend so our `bytesWritten` baseline (see `isClaimed` below) is
	// captured before any other listener can write its 101 response.
	// See https://github.com/cloudflare/workers-sdk/issues/15654
	httpServer.prependListener(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			// Socket errors crash Node.js if unhandled
			socket.on("error", () => socket.destroy());

			// True once another listener has claimed the socket (written its 101).
			// `bytesWritten` is lifetime-cumulative, so compare against a baseline
			// rather than zero to stay correct on reused keep-alive connections.
			const bytesWrittenAtStart =
				(socket as unknown as Socket).bytesWritten ?? 0;
			const isClaimed = () =>
				(socket as unknown as Socket).bytesWritten > bytesWrittenAtStart;

			// Snapshot other-listener presence now, before the first yield: a
			// once("upgrade") owner is removed before its callback runs, so a
			// count taken after dispatchFetch cannot see it. Listeners added
			// later cannot receive this already-emitted event, so the snapshot
			// stays valid for this socket.
			const hadOtherListeners = httpServer.listenerCount("upgrade") > 1;

			// Synchronous preamble — runs before any other listener (we prepend).
			// A throw here must not destroy the socket, since the real owner's
			// listener hasn't run yet; bail out and leave it untouched.
			let url: URL;
			let isViteRequest: boolean | undefined;
			let isSandboxRequest: boolean;
			try {
				const rawHost = request.headers.host ?? UNKNOWN_HOST;
				// Honor `X-Forwarded-Proto` so that the upgrade URL reflects the
				// protocol the original client used (e.g. behind a TLS-terminating
				// reverse proxy or tunnel). Matches `createRequestHandler` in utils.ts.
				const protocol = getForwardedProto(request) ?? "http:";
				const base = /^https?:\/\//i.test(rawHost)
					? rawHost
					: `${protocol}//${rawHost}`;
				url = new URL(request.url ?? "", base);

				isViteRequest =
					request.headers["sec-websocket-protocol"]?.startsWith("vite");
				isSandboxRequest = hasSandboxOrigin(url.origin);
			} catch {
				trackUnresolved(socket);
				return;
			}

			// Ignore Vite HMR WebSockets but forward on all sandbox requests.
			if (isViteRequest && !isSandboxRequest) {
				trackUnresolved(socket);
				return;
			}

			const headers = createHeaders(request);

			if (entryWorkerName) {
				headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
			}

			try {
				const response = await miniflare.dispatchFetch(url, {
					headers: headers as unknown as Headers,
					method: request.method,
				});
				const workerWebSocket = response.webSocket;

				if (!workerWebSocket) {
					// No route on the Worker → this upgrade isn't ours. If another
					// listener claimed it, leave it untouched; otherwise tear it
					// down deferred by a tick (an unanswered upgrade dangles
					// forever and hangs `httpServer.close()`), but only when no
					// other `upgrade` listener could still be processing it (see
					// hadOtherListeners above). The socket is tracked instead so
					// server shutdown can still reap it (see pendingUpgrades).
					// `isClaimed()` only sees bytes already written, so it can't
					// reveal a delayed async owner (e.g. awaiting auth) — and any
					// fixed deadline races one. With only this listener
					// registered, no other owner can exist for an already-emitted
					// event, so deferred teardown is safe.
					if (socket.destroyed || isClaimed()) {
						return;
					}
					if (hadOtherListeners) {
						trackUnresolved(socket);
						return;
					}
					setImmediate(() => {
						if (!socket.destroyed && !isClaimed()) {
							socket.destroy();
						}
					});
					return;
				}

				// Another listener claimed the socket, or the client went away,
				// while `dispatchFetch` was in flight: don't attempt a second upgrade.
				if (socket.destroyed || isClaimed()) {
					workerResponseHeaders.delete(request);
					return;
				}

				// Forward response headers (e.g. Set-Cookie, custom auth headers) from
				// the Worker's 101 response onto the upgrade response sent to the
				// client. Without this, headers set on a `new Response(null, { status:
				// 101, webSocket, headers })` are silently dropped during `vite dev`,
				// even though they are delivered correctly by `wrangler dev`.
				// See cloudflare/workers-sdk#10390.
				workerResponseHeaders.set(request, response.headers);

				nodeWebSocket.handleUpgrade(
					request,
					socket,
					head,
					async (clientWebSocket) => {
						void coupleWebSocket(clientWebSocket, workerWebSocket);
						nodeWebSocket.emit("connection", clientWebSocket, request);
					}
				);
			} catch {
				// `dispatchFetch` can reject mid-upgrade (e.g. when Miniflare is
				// disposed on dev server restart). This listener is `async`, so
				// an uncaught rejection would crash Node and leak the socket.
				// Tear it down, but only if no other listener claimed it in
				// the meantime and no other listener could still own it (see
				// hadOtherListeners above): a rejection is not proof of
				// disposal, and another listener may yet finish a viable
				// handshake on this socket.
				workerResponseHeaders.delete(request);
				if (socket.destroyed || isClaimed()) {
					return;
				}
				if (hadOtherListeners) {
					trackUnresolved(socket);
					return;
				}
				socket.destroy();
			}
		}
	);
}

/**
 * Headers that must not be forwarded on the 101 upgrade response — they are
 * either part of the WebSocket handshake managed by `ws` or irrelevant on a
 * response with no body.
 */
const EXCLUDED_RESPONSE_HEADERS = new Set([
	"connection",
	"content-length",
	"sec-websocket-accept",
	"sec-websocket-extensions",
	"sec-websocket-protocol",
	"transfer-encoding",
	"upgrade",
]);

function appendWorkerResponseHeaders(
	responseHeaders: string[],
	workerHeaders: Headers
) {
	// `Set-Cookie` can appear multiple times in a single response.
	// `Headers.forEach` collapses them into a single comma-joined value, which
	// breaks cookies that themselves contain commas (e.g. Expires).
	// `getSetCookie` returns them as a string array.
	if (typeof workerHeaders.getSetCookie === "function") {
		for (const cookie of workerHeaders.getSetCookie()) {
			responseHeaders.push(`Set-Cookie: ${cookie}`);
		}
	}

	workerHeaders.forEach((value, name) => {
		const lower = name.toLowerCase();
		if (lower === "set-cookie") {
			return;
		}
		if (EXCLUDED_RESPONSE_HEADERS.has(lower)) {
			return;
		}
		responseHeaders.push(`${name}: ${value}`);
	});
}

/**
 * Matches the origin of a Sandbox SDK preview URL.
 * See: https://developers.cloudflare.com/sandbox/concepts/preview-urls/
 *
 * Pattern: https?://<port(4+ digits)>-<id(no dots)>-<token>.localhost
 *
 * IMPORTANT: The token segment is [a-z0-9_]+ (no hyphens) to prevent ReDoS — two adjacent
 * [^.]+ groups separated by - cause quadratic backtracking on hyphen-heavy input. Tokens are
 * documented as letters/digits/underscores only.
 */
const SANDBOX_ORIGIN_REGEXP =
	/^https?:\/\/\d{4,}-[^.]+-[a-z0-9_]+\.localhost(:\d+)?$/i;

function hasSandboxOrigin(origin: string) {
	return SANDBOX_ORIGIN_REGEXP.test(origin);
}
