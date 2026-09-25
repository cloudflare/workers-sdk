import { createHeaders } from "@remix-run/node-fetch-server";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import { getForwardedProto } from "./utils";
import type { Headers, Miniflare, WebSocket } from "miniflare";
import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import type * as vite from "vite";

/** Per-server marker so repeated setup reuses the listeners installed first. */
const WEBSOCKET_STATE = Symbol("cloudflare.websockets");

interface DispatchTarget {
	miniflare: Miniflare;
	entryWorkerName?: string;
}

type TaggedServer = vite.HttpServer & {
	[WEBSOCKET_STATE]?: { target: DispatchTarget };
};

/**
 * Handles 'upgrade' requests to the Vite HTTP server and forwards WebSocket events between the client and Worker environments.
 *
 * Node invokes _every_ registered `upgrade` listener, so this handler shares
 * each upgrade with Vite's HMR listener and any third-party listener (e.g. Vite
 * DevTools). It may therefore only answer upgrades no one else has claimed, and
 * may only tear a socket down when it is the sole possible owner.
 * See https://github.com/cloudflare/workers-sdk/issues/15654.
 */
export function handleWebSocket(
	httpServer: vite.HttpServer,
	miniflare: Miniflare,
	entryWorkerName?: string
) {
	const server = httpServer as TaggedServer;
	const existingState = server[WEBSOCKET_STATE];

	if (existingState) {
		// A dev server restart re-runs setup against a fresh Miniflare instance:
		// retarget the existing listener rather than adding a second one.
		existingState.target = { miniflare, entryWorkerName };
		return;
	}

	const state = { target: { miniflare, entryWorkerName } };
	server[WEBSOCKET_STATE] = state;

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

	const trackUpgrade = trackUpgrades(server);

	// Prepended so that per-upgrade state is captured before any other listener
	// can write a response to the socket.
	server.prependListener(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			// Socket errors crash Node.js if unhandled
			socket.on("error", () => socket.destroy());

			const upgrade = trackUpgrade(request, socket);

			try {
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

				const { miniflare: target, entryWorkerName: routeOverride } =
					state.target;

				if (routeOverride) {
					headers.set(CoreHeaders.ROUTE_OVERRIDE, routeOverride);
				}

				const response = await target.dispatchFetch(url, {
					headers: headers as unknown as Headers,
					method: request.method,
				});
				const workerWebSocket = response.webSocket;

				if (!workerWebSocket) {
					upgrade.release();
					return;
				}

				if (!upgrade.isAnswerable()) {
					// Another listener claimed the upgrade, or the client went away,
					// while `dispatchFetch` was pending.
					closeUnusedWebSocket(workerWebSocket);
					upgrade.release();
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
				// Rejections reaching here (e.g. `dispatchFetch` after Miniflare has
				// been disposed, or an unparseable `Host` header) must be consumed:
				// this listener is `async`, so they would otherwise escape as unhandled
				// rejections and terminate the process.
				workerResponseHeaders.delete(request);
				upgrade.release();
			}
		}
	);
}

interface Upgrade {
	/** Whether this handler may still perform the upgrade itself. */
	isAnswerable(): boolean;
	/**
	 * Give up on the upgrade: destroy the socket if no other listener can own
	 * it, otherwise leave it for them.
	 */
	release(): void;
}

/**
 * Installs the per-server bookkeeping this handler needs and returns a factory
 * for the state of a single upgrade.
 */
function trackUpgrades(server: vite.HttpServer) {
	interface Snapshot {
		hasOtherListeners: boolean;
		bytesWritten: number;
	}
	const snapshots = new WeakMap<IncomingMessage, Snapshot>();
	// Sockets left open for another listener, mapped to their write baseline.
	// `server.close()` would wait on them forever if nobody answers.
	const unresolved = new Map<Duplex, number>();
	let closing = false;

	const nodeServer = server as Server;
	const emit = nodeServer.emit.bind(nodeServer);

	// `once()` and `prependOnceListener()` owners remove themselves as they are
	// invoked, so whether anyone else could own an upgrade is only knowable
	// before the event is dispatched.
	nodeServer.emit = function (event: string, ...args: unknown[]) {
		if (event === "upgrade") {
			const [request, socket] = args as [IncomingMessage, Duplex];
			snapshots.set(request, {
				hasOtherListeners: nodeServer.listenerCount("upgrade") > 1,
				bytesWritten: bytesWritten(socket),
			});
		}
		return emit(event, ...args);
	} as Server["emit"];

	const close = nodeServer.close.bind(nodeServer);
	nodeServer.close = function (callback?: (error?: Error) => void) {
		closing = true;
		for (const [socket, baseline] of unresolved) {
			if (bytesWritten(socket) === baseline) {
				socket.destroy();
			}
		}
		unresolved.clear();
		return close(callback);
	} as Server["close"];

	nodeServer.on("listening", () => {
		closing = false;
	});

	return function upgrade(request: IncomingMessage, socket: Duplex): Upgrade {
		const snapshot = snapshots.get(request) ?? {
			hasOtherListeners: nodeServer.listenerCount("upgrade") > 1,
			bytesWritten: bytesWritten(socket),
		};
		// `bytesWritten` is cumulative for the connection, so a reused keep-alive
		// socket needs the baseline taken when this upgrade started.
		const isClaimed = () => bytesWritten(socket) > snapshot.bytesWritten;

		return {
			isAnswerable() {
				// Answering while the server is closing would leave an upgraded socket
				// open that Node does not close, blocking `server.close()`.
				return !closing && !isClaimed() && !socket.destroyed && socket.writable;
			},
			release() {
				if (isClaimed() || socket.destroyed) {
					return;
				}
				if (!snapshot.hasOtherListeners || closing) {
					socket.destroy();
					return;
				}
				unresolved.set(socket, snapshot.bytesWritten);
				socket.once("close", () => unresolved.delete(socket));
			},
		};
	};
}

function bytesWritten(socket: Duplex) {
	return (socket as Socket).bytesWritten ?? 0;
}

/** Releases a Worker WebSocket that will never be coupled to a client. */
function closeUnusedWebSocket(workerWebSocket: WebSocket) {
	workerWebSocket.accept();
	workerWebSocket.close(1001, "Upgrade handled by another listener");
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
