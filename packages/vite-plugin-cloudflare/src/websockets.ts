import { createHeaders } from "@remix-run/node-fetch-server";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
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

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			// Socket errors crash Node.js if unhandled
			socket.on("error", () => socket.destroy());

			const rawHost = request.headers.host ?? UNKNOWN_HOST;
			const base = /^https?:\/\//i.test(rawHost)
				? rawHost
				: `http://${rawHost}`;
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
