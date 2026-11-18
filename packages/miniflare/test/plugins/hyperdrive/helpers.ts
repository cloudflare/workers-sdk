import assert from "node:assert";
import { once } from "node:events";
import { onTestFinished } from "vitest";
import { WebSocketServer } from "ws";
import type { RemoteProxyConnectionString } from "miniflare";

export async function useRemoteProxyServer() {
	const edge = new WebSocketServer({ port: 0, host: "127.0.0.1" });
	await once(edge, "listening");
	const address = edge.address();
	assert(address !== null && typeof address !== "string");
	onTestFinished(async () => {
		for (const websocket of edge.clients) {
			websocket.terminate();
		}
		await new Promise<void>((resolve, reject) =>
			edge.close((error) => (error ? reject(error) : resolve()))
		);
	});
	return {
		edge,
		url: new URL(
			`http://127.0.0.1:${address.port}`
		) as RemoteProxyConnectionString,
	};
}
