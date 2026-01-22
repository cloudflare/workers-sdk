import http from "node:http";
import net from "node:net";
import { DeferredPromise, Miniflare, Response } from "miniflare";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleWebSocket } from "../websockets";
import type { AddressInfo } from "node:net";

describe("handleWebSocket", () => {
	let httpServer: http.Server;
	let miniflare: Miniflare;
	let port: number;

	beforeEach(async () => {
		httpServer = http.createServer((_req, res) => res.end("OK"));
		miniflare = new Miniflare({
			modules: true,
			script: `export default {
				fetch() {
					const [client, server] = Object.values(new WebSocketPair());
					server.accept();
					return new Response(null, { status: 101, webSocket: client });
				}
			}`,
		});
		handleWebSocket(httpServer, miniflare);
		await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
		port = (httpServer.address() as AddressInfo).port;
	});

	afterEach(async () => {
		await miniflare?.dispose();
		await new Promise<void>((resolve, reject) =>
			httpServer?.close((e) => (e ? reject(e) : resolve()))
		);
	});

	// https://github.com/cloudflare/workers-sdk/issues/12047
	test("survives client disconnect during upgrade", async () => {
		// Mock dispatchFetch to simulate a slow response - the bug occurs when
		// the client disconnects while dispatchFetch is pending
		const deferred = new DeferredPromise<Response>();
		vi.spyOn(miniflare, "dispatchFetch").mockReturnValue(deferred);

		const socket = net.connect(port, "127.0.0.1");
		await new Promise<void>((r) => socket.on("connect", r));
		socket.write(
			"GET / HTTP/1.1\r\n" +
				"Host: localhost\r\n" +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		// Reset connection while dispatchFetch is pending, triggering ECONNRESET
		socket.resetAndDestroy();

		// Resolve the mock so miniflare.dispose() doesn't hang in afterEach
		deferred.resolve(new Response(null));

		// Verify server did not crash and is still responsive
		const response = await fetch(`http://127.0.0.1:${port}`);
		expect(response.ok).toBe(true);
	});
});
