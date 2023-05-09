import http from "http";
import { AddressInfo } from "net";
import { URL } from "url";
import { isMainThread } from "worker_threads";
import { ExecutionContext } from "ava";
import NodeWebSocket, { WebSocketServer } from "ws";

// Returns a free port, whilst preventing races between test files
export async function getPort(): Promise<number> {
	if (isMainThread) {
		// eslint-disable-next-line es/no-dynamic-import
		return (await import("get-port")).default();
	} else {
		// `@ava/get-port` is ESM-only, but we bundle to CommonJS, so use a dynamic
		// `import` here.
		// eslint-disable-next-line es/no-dynamic-import
		return (await import("@ava/get-port")).default();
	}
}

export async function useServer(
	t: ExecutionContext,
	listener: http.RequestListener,
	webSocketListener?: (socket: NodeWebSocket, req: http.IncomingMessage) => void
): Promise<{ http: URL; ws: URL }> {
	return new Promise((resolve) => {
		const server = http.createServer(listener);
		// Only setup web socket server if listener provided
		if (webSocketListener) {
			const wss = new WebSocketServer({ server });
			wss.on("connection", webSocketListener);
		}
		// 0 binds to random unused port
		server.listen(0, () => {
			t.teardown(() => server.close());
			const port = (server.address() as AddressInfo).port;
			resolve({
				http: new URL(`http://localhost:${port}`),
				ws: new URL(`ws://localhost:${port}`),
			});
		});
	});
}
