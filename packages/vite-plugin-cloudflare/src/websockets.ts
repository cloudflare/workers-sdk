import { createHeaders } from "@remix-run/node-fetch-server";
import { coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import type { MaybePromise } from "./utils";
import type { Fetcher } from "@cloudflare/workers-types/experimental";
import type { ReplaceWorkersTypes } from "miniflare";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type * as vite from "vite";

/**
 * This function handles 'upgrade' requests to the Vite HTTP server and forwards WebSocket events between the client and Worker environments.
 */
export function handleWebSocket(
	httpServer: vite.HttpServer,
	getFetcher: () => MaybePromise<ReplaceWorkersTypes<Fetcher>["fetch"]>
) {
	const nodeWebSocket = new WebSocketServer({ noServer: true });

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			const url = new URL(request.url ?? "", UNKNOWN_HOST);

			// Ignore Vite HMR WebSockets
			if (request.headers["sec-websocket-protocol"]?.startsWith("vite")) {
				return;
			}

			const headers = createHeaders(request);
			const fetcher = await getFetcher();
			const response = await fetcher(url, {
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
					coupleWebSocket(clientWebSocket, workerWebSocket);
					nodeWebSocket.emit("connection", clientWebSocket, request);
				}
			);
		}
	);
}
