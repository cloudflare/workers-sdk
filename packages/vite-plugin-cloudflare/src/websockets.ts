import { createHeaders } from "@remix-run/node-fetch-server";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import { getForwardedProto } from "./utils";
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

			const rawHost = request.headers.host ?? UNKNOWN_HOST;
			// Honor `X-Forwarded-Proto` so that the upgrade URL reflects the
			// protocol the original client used (e.g. behind a TLS-terminating
			// reverse proxy or tunnel). Matches `createRequestHandler` in utils.ts.
			const protocol = getForwardedProto(request) ?? "http:";
			const base = /^https?:\/\//i.test(rawHost)
				? rawHost
				: `${protocol}//${rawHost}`;
			const url = new URL(request.url ?? "", base);

			const isViteRequest =
				request.headers["sec-websocket-protocol"]?.startsWith("vite");
			const isSandboxRequest = hasSandboxOrigin(url.origin);

			// Ignore Vite HMR WebSockets but forward on all sandbox requests.
			if (isViteRequest && !isSandboxRequest) {
				return;
			}

			const headers = createHeaders(request);

			if (entryWorkerName) {
				headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
			}

			const response = await miniflare.dispatchFetch(url, {
				headers: headers as unknown as Headers,
				method: request.method,
			});
			const workerWebSocket = response.webSocket;

			if (!workerWebSocket) {
				socket.destroy();
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
