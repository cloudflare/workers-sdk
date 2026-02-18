import { createHeaders } from "@remix-run/node-fetch-server";
import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import type { Miniflare } from "miniflare";
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

			const url = new URL(request.url ?? "", UNKNOWN_HOST);

			// Ignore Vite HMR WebSockets
			if (request.headers["sec-websocket-protocol"]?.startsWith("vite")) {
				return;
			}

			const headers = createHeaders(request);

			if (entryWorkerName) {
				headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
			}

			const response = await miniflare.dispatchFetch(url, {
				headers,
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
