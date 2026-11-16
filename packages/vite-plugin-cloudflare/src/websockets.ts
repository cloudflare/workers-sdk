import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import {
	createHeadersForIncomingMessage,
	getForwardedProto,
	resolveRequestTarget,
} from "./utils";
import type { Headers, Miniflare } from "miniflare";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type * as vite from "vite";

/**
 * Handles 'upgrade' requests to the Vite HTTP server and forwards WebSocket events between the client and Worker environments.
 */
export function handleWebSocket(
	httpServer: vite.HttpServer,
	miniflare: Miniflare,
	entryWorkerName?: string,
	viteWebSocketEnabled = false
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

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			// Socket errors crash Node.js if unhandled
			socket.on("error", () => socket.destroy());

			try {
				const rawHost = request.headers.host ?? UNKNOWN_HOST;
				// Honor `X-Forwarded-Proto` so that the upgrade URL reflects the
				// protocol the original client used (e.g. behind a TLS-terminating
				// reverse proxy or tunnel). Matches `createRequestHandler` in utils.ts.
				const protocol = getForwardedProto(request) ?? "http:";
				const base = /^https?:\/\//i.test(rawHost)
					? rawHost
					: `${protocol}//${rawHost}`;
				const url = resolveRequestTarget(request.url ?? "/", base);

				const isViteRequest =
					request.headers["sec-websocket-protocol"]?.startsWith("vite");
				const isDevToolsRequest = url.pathname === "/__devtools/__ws";
				const isSandboxRequest = hasSandboxOrigin(url.origin);

				// Leave Vite HMR and DevTools upgrades to their own handlers, but
				// forward all sandbox requests to the Worker.
				if ((isViteRequest || isDevToolsRequest) && !isSandboxRequest) {
					// No Vite handler claims HMR upgrades when `server.ws` is disabled.
					if (isViteRequest && !viteWebSocketEnabled) {
						socket.destroy();
					}
					return;
				}

				const headers = createHeadersForIncomingMessage(request);

				if (entryWorkerName) {
					headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				}

				const response = await miniflare.dispatchFetch(url, {
					headers: [...headers],
					method: request.method,
				});
				const workerWebSocket = response.webSocket;

				if (!workerWebSocket) {
					socket.destroy();
					return;
				}

				if (socket.destroyed) {
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
				// `dispatchFetch` rejects if Miniflare is disposed while an upgrade
				// is still in flight (e.g. during dev server shutdown or restart).
				// This listener is `async`, so an uncaught rejection here escapes as
				// an unhandled rejection — which terminates the Node.js process on
				// modern versions and leaks the client socket. Tear the socket down
				// instead.
				workerResponseHeaders.delete(request);
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
	// Iteration preserves separate Set-Cookie values, including commas in Expires.
	for (const [name, value] of workerHeaders) {
		if (EXCLUDED_RESPONSE_HEADERS.has(name)) {
			continue;
		}
		responseHeaders.push(`${name}: ${value}`);
	}
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
