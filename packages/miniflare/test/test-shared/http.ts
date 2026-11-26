import http from "node:http";
import { URL } from "node:url";
import stoppable from "stoppable";
import { onTestFinished } from "vitest";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import type NodeWebSocket from "ws";

export async function useServer(
	listener: http.RequestListener,
	webSocketListener?: (socket: NodeWebSocket, req: http.IncomingMessage) => void
): Promise<{ http: URL; ws: URL }> {
	return new Promise((resolve) => {
		const server = stoppable(http.createServer(listener), /* grace */ 0);
		// Only setup web socket server if listener provided
		if (webSocketListener) {
			const wss = new WebSocketServer({ server });
			wss.on("connection", webSocketListener);
		}
		// 0 binds to a random unused port. Bind IPv4 loopback explicitly: macOS
		// lets another process bind 127.0.0.1 on a port this server holds as
		// [::], which would then receive this server's IPv4 connections.
		server.listen(0, "127.0.0.1", () => {
			onTestFinished(() => {
				return new Promise((resolve, reject) =>
					server.stop((err) => (err ? reject(err) : resolve()))
				);
			});
			const port = (server.address() as AddressInfo).port;
			resolve({
				http: new URL(`http://127.0.0.1:${port}`),
				ws: new URL(`ws://127.0.0.1:${port}`),
			});
		});
	});
}
