import http from "node:http";
import net from "node:net";
import { CoreHeaders, DeferredPromise, Miniflare, Response } from "miniflare";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	type ExpectStatic,
	test,
	vi,
} from "vitest";
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
	test("survives client disconnect during upgrade", async ({ expect }) => {
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

	test("forwards sandbox requests", async ({ expect }) => {
		const deferred = new DeferredPromise<Response>();
		const mockedDispatchFetch = vi
			.spyOn(miniflare, "dispatchFetch")
			.mockReturnValue(deferred);

		const socket = net.connect(port, "127.0.0.1");
		await new Promise<void>((r) => socket.on("connect", r));
		socket.write(
			"GET / HTTP/1.1\r\n" +
				`Host: 4567-my-sandbox-sup3rs3cr3t.localhost:${port}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Protocol: vite-hmr\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		await vi.waitFor(() => expect(miniflare.dispatchFetch).toHaveBeenCalled());

		// Resolve the mock so miniflare.dispose() doesn't hang in afterEach
		deferred.resolve(new Response(null));

		assert(mockedDispatchFetch.mock.lastCall);
		const [url, init] = mockedDispatchFetch.mock.lastCall;

		assert(init);
		expect(`${url}`).toBe(
			`http://4567-my-sandbox-sup3rs3cr3t.localhost:${port}/`
		);
		expect(init.method).toBe("GET");

		assert(
			init.headers instanceof Headers,
			"Test expects headers object passed to dispatchFetch to be Headers instance"
		);
		expect(init.headers.get("host")).toBe(
			`4567-my-sandbox-sup3rs3cr3t.localhost:${port}`
		);
		expect(init.headers.get("upgrade")).toBe("websocket");
		expect(init.headers.get("connection")).toBe("Upgrade");
		expect(init.headers.get("sec-websocket-key")).toBe(
			"dGhlIHNhbXBsZSBub25jZQ=="
		);
		expect(init.headers.get("sec-websocket-protocol")).toBe("vite-hmr");
		expect(init.headers.get("sec-websocket-version")).toBe("13");
	});
});

describe("handleWebSocket with entryWorkerName", () => {
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
		handleWebSocket(httpServer, miniflare, "entry-worker");
		await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
		port = (httpServer.address() as AddressInfo).port;
	});

	afterEach(async () => {
		await miniflare?.dispose();
		await new Promise<void>((resolve, reject) =>
			httpServer?.close((e) => (e ? reject(e) : resolve()))
		);
	});

	async function performUpgrade(expect: ExpectStatic, extraHeaders: string) {
		const deferred = new DeferredPromise<Response>();
		const spy = vi.spyOn(miniflare, "dispatchFetch").mockReturnValue(deferred);

		const socket = net.connect(port, "127.0.0.1");
		await new Promise<void>((r) => socket.on("connect", r));
		socket.write(
			"GET / HTTP/1.1\r\n" +
				"Host: localhost\r\n" +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n" +
				extraHeaders +
				"\r\n"
		);

		await vi.waitFor(() => expect(spy).toHaveBeenCalled());
		deferred.resolve(new Response(null));

		assert(spy.mock.lastCall);
		const [, init] = spy.mock.lastCall;
		assert(init);
		assert(init.headers instanceof Headers);
		socket.destroy();
		return init.headers;
	}

	test("sets MF-Route-Override to the entry worker name when absent", async ({
		expect,
	}) => {
		const headers = await performUpgrade(expect, "");
		expect(headers.get(CoreHeaders.ROUTE_OVERRIDE)).toBe("entry-worker");
	});

	test("preserves a caller-supplied MF-Route-Override", async ({ expect }) => {
		const headers = await performUpgrade(
			expect,
			`${CoreHeaders.ROUTE_OVERRIDE}: other-worker\r\n`
		);
		expect(headers.get(CoreHeaders.ROUTE_OVERRIDE)).toBe("other-worker");
	});
});
