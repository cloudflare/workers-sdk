import * as http from "node:http";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import { createHeadersForIncomingMessage, getForwardedProto } from "./utils";
import type { Headers, Miniflare, Response } from "miniflare";
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
				const url = new URL(request.url ?? "", base);

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
					// Destroy unclaimed upgrades that the Worker does not route (404 Worker miss).
					if (response.status === 404) {
						socket.destroy();
						if (response.body != null) {
							void response.body.cancel().catch(() => {});
						}
						return;
					}

					if (!socket.destroyed && !socket.closed) {
						socket.resume();
						try {
							await writeHttpResponse(
								socket,
								response as unknown as Response,
								request.method
							);
						} catch {
							// Client disconnected or write failed
							socket.destroy();
						}
					} else if (response.body != null) {
						void response.body.cancel().catch(() => {});
					}
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

/**
 * Waits for a socket to drain when `write()` returns false.
 * Resolves on 'drain', 'close', or 'error' to prevent hanging indefinitely
 * if the remote peer disconnects while backpressure is being relieved.
 */
export function waitForSocketDrain(socket: Duplex): Promise<void> {
	if (socket.destroyed || socket.closed) {
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => {
		const cleanup = () => {
			socket.off("drain", onDrain);
			socket.off("close", onClose);
			socket.off("error", onError);
		};
		const onDrain = () => {
			cleanup();
			resolve();
		};
		const onClose = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			resolve();
		};
		socket.once("drain", onDrain);
		socket.once("close", onClose);
		socket.once("error", onError);
	});
}

/**
 * Writes an HTTP response directly to a raw socket with backpressure support and orderly EOF.
 * Used when a Worker returns a non-101 rejection response to a WebSocket upgrade request.
 */
async function writeHttpResponse(
	socket: Duplex,
	response: Response,
	requestMethod?: string
) {
	if (socket.destroyed || socket.closed) {
		if (response.body != null) {
			void response.body.cancel().catch(() => {});
		}
		return;
	}

	const status = response.status;
	const statusText =
		response.statusText || http.STATUS_CODES[status] || "Unknown";
	let headerString = `HTTP/1.1 ${status} ${statusText}\r\n`;

	let hasConnection = false;
	const setCookies =
		typeof response.headers.getSetCookie === "function"
			? response.headers.getSetCookie()
			: [];
	for (const cookie of setCookies) {
		headerString += `Set-Cookie: ${cookie}\r\n`;
	}

	for (const [name, value] of response.headers.entries()) {
		const lower = name.toLowerCase();
		if (lower === "set-cookie") {
			continue;
		}
		if (lower === "connection") {
			hasConnection = true;
		}
		headerString += `${name}: ${value}\r\n`;
	}

	if (!hasConnection) {
		headerString += "Connection: close\r\n";
	}
	headerString += "\r\n";

	if (socket.destroyed || socket.closed) {
		if (response.body != null) {
			void response.body.cancel().catch(() => {});
		}
		return;
	}

	if (socket.write(headerString) === false) {
		await waitForSocketDrain(socket);
	}

	if (response.body != null) {
		if (requestMethod === "HEAD" || socket.destroyed || socket.closed) {
			void response.body.cancel().catch(() => {});
		} else {
			const reader = response.body.getReader();
			let isSocketClosed = false;
			let onSocketTerminal: (() => void) | undefined;

			const socketClosedPromise = new Promise<{
				done: true;
				value: undefined;
			}>((resolve) => {
				onSocketTerminal = () => {
					isSocketClosed = true;
					void reader.cancel().catch(() => {});
					resolve({ done: true, value: undefined });
				};
				if (socket.destroyed || socket.closed) {
					onSocketTerminal();
				}
			});

			if (onSocketTerminal && !socket.destroyed && !socket.closed) {
				socket.once("close", onSocketTerminal);
				socket.once("error", onSocketTerminal);
				socket.once("end", onSocketTerminal);
			}

			try {
				while (!isSocketClosed && !socket.destroyed && !socket.closed) {
					const { done, value } = await Promise.race([
						reader.read(),
						socketClosedPromise,
					]);
					if (done) {
						break;
					}
					if (isSocketClosed || socket.destroyed || socket.closed) {
						break;
					}
					if (value && socket.write(value) === false) {
						await waitForSocketDrain(socket);
					}
				}
			} catch {
				// Reader was cancelled or read threw on disconnect/error
			} finally {
				if (onSocketTerminal) {
					socket.off("close", onSocketTerminal);
					socket.off("error", onSocketTerminal);
					socket.off("end", onSocketTerminal);
				}
				if (isSocketClosed || socket.destroyed || socket.closed) {
					try {
						await reader.cancel();
					} catch {}
				}
				try {
					reader.releaseLock();
				} catch {}
			}
		}
	}

	if (!socket.destroyed && !socket.closed) {
		socket.end();
		await new Promise<void>((resolve) => {
			let timer: NodeJS.Timeout | undefined;
			const done = () => {
				if (timer) clearTimeout(timer);
				resolve();
			};
			socket.once("close", done);
			socket.once("error", done);
			// If remote peer does not drain unread bytes or close its write half,
			// tear down the socket to avoid hanging the upgrade listener.
			timer = setTimeout(() => {
				if (!socket.destroyed && !socket.closed) {
					socket.destroy();
				}
				done();
			}, 100);
			timer.unref?.();
		});
	}
}
