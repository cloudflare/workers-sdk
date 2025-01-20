import ws from "ws";
import { UNKNOWN_HOST } from "./shared";
import { nodeHeadersToWebHeaders } from "./utils";
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
	fetcher: ReplaceWorkersTypes<Fetcher>["fetch"],
	logger: vite.Logger
) {
	const nodeWebSocket = new ws.Server({ noServer: true });

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			const url = new URL(request.url ?? "", UNKNOWN_HOST);

			// Ignore Vite HMR WebSockets
			if (request.headers["sec-websocket-protocol"]?.startsWith("vite")) {
				return;
			}

			const headers = nodeHeadersToWebHeaders(request.headers);
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
					workerWebSocket.accept();

					// Forward Worker events to client
					workerWebSocket.addEventListener("message", (event) => {
						clientWebSocket.send(event.data);
					});
					workerWebSocket.addEventListener("error", (event) => {
						logger.error(
							`WebSocket error:\n${event.error?.stack || event.error?.message}`,
							{ error: event.error }
						);
					});
					workerWebSocket.addEventListener("close", () => {
						clientWebSocket.close();
					});

					// Forward client events to Worker
					clientWebSocket.on("message", (event: ArrayBuffer | string) => {
						workerWebSocket.send(event);
					});
					clientWebSocket.on("error", (error) => {
						logger.error(`WebSocket error:\n${error.stack || error.message}`, {
							error,
						});
					});
					clientWebSocket.on("close", () => {
						workerWebSocket.close();
					});

					nodeWebSocket.emit("connection", clientWebSocket, request);
				}
			);
		}
	);
}
