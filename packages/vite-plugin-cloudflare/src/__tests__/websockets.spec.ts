import http from "node:http";
import net from "node:net";
import { DeferredPromise, Miniflare, Response } from "miniflare";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	type ExpectStatic,
	onTestFinished,
	test,
	vi,
} from "vitest";
import { handleWebSocket } from "../websockets";
import type { AddressInfo } from "node:net";

describe("handleWebSocket", () => {
	let httpServer: http.Server;
	let miniflare: Miniflare | undefined;
	let port: number;
	const openSockets = new Set<net.Socket>();

	const DEFAULT_WORKER_SCRIPT = `export default {
		fetch() {
			const [client, server] = Object.values(new WebSocketPair());
			server.accept();
			return new Response(null, { status: 101, webSocket: client });
		}
	}`;

	beforeEach(() => {
		miniflare = undefined;
		httpServer = http.createServer((_req, res) => res.end("OK"));
	});

	/**
	 * Creates the `Miniflare` instance used by the test. Kept out of
	 * `beforeEach` so tests that need a custom Worker script don't have to
	 * spawn-then-immediately-dispose a throwaway `workerd` process.
	 */
	function startMiniflare(script: string = DEFAULT_WORKER_SCRIPT) {
		miniflare = new Miniflare({
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2023-07-24",
						manifest: {
							mainModule: "index.mjs",
							modules: {
								"index.mjs": { type: "esm", contents: script },
							},
						},
						env: {},
						exports: {},
					},
				},
			],
		});
		return miniflare;
	}

	/**
	 * Opens a tracked client socket so `afterEach` can always tear it down,
	 * even if a test throws before its own cleanup runs.
	 */
	async function connect() {
		const socket = net.connect(port, "127.0.0.1");
		openSockets.add(socket);
		socket.on("close", () => openSockets.delete(socket));
		await new Promise<void>((r) => socket.on("connect", r));
		return socket;
	}

	async function listen(entryWorkerName?: string) {
		const mf = miniflare ?? startMiniflare();
		handleWebSocket(httpServer, mf, entryWorkerName);
		await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
		port = (httpServer.address() as AddressInfo).port;
		// Wait for `workerd` to boot here (under the generous `testTimeout`)
		// rather than letting the cold start eat into the tight `vi.waitFor`
		// budgets below, which caused Windows CI flakes.
		await mf.ready;
		return mf;
	}

	afterEach(async () => {
		// Destroy any client sockets first so `httpServer.close()` doesn't hang
		// waiting on live connections (which would surface as a hook timeout).
		for (const socket of openSockets) {
			socket.destroy();
		}
		openSockets.clear();
		httpServer?.closeAllConnections();
		await miniflare?.dispose();
		await new Promise<void>((resolve, reject) =>
			httpServer?.close((e) => (e ? reject(e) : resolve()))
		);
	});

	// https://github.com/cloudflare/workers-sdk/issues/12047
	test("survives client disconnect during upgrade", async ({ expect }) => {
		const mf = await listen();

		// Mock dispatchFetch to simulate a slow response - the bug occurs when
		// the client disconnects while dispatchFetch is pending
		const deferred = new DeferredPromise<Response>();
		vi.spyOn(mf, "dispatchFetch").mockReturnValue(deferred);

		const socket = await connect();
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
		const mf = await listen();

		const deferred = new DeferredPromise<Response>();
		const mockedDispatchFetch = vi
			.spyOn(mf, "dispatchFetch")
			.mockReturnValue(deferred);

		const socket = await connect();
		socket.write(
			"GET / HTTP/1.1\r\n" +
				`Host: 4567-my-sandbox-sup3rs3cr3t.localhost:${port}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Protocol: vite-hmr\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		await vi.waitFor(() => expect(mf.dispatchFetch).toHaveBeenCalled());

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

	/**
	 * Performs a websocket upgrade with the given headers and returns the URL
	 * that was dispatched to miniflare.
	 */
	async function dispatchUpgrade(
		expect: ExpectStatic,
		mf: Miniflare,
		headers: Record<string, string>
	) {
		const deferred = new DeferredPromise<Response>();
		const mockedDispatchFetch = vi
			.spyOn(mf, "dispatchFetch")
			.mockReturnValue(deferred);

		const socket = await connect();

		const headerLines = Object.entries(headers)
			.map(([k, v]) => `${k}: ${v}`)
			.join("\r\n");
		socket.write(
			"GET / HTTP/1.1\r\n" +
				`${headerLines}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		await vi.waitFor(() => expect(mf.dispatchFetch).toHaveBeenCalled());

		// Resolve the mock so miniflare.dispose() doesn't hang in afterEach
		deferred.resolve(new Response(null));

		socket.destroy();

		assert(mockedDispatchFetch.mock.lastCall);
		return mockedDispatchFetch.mock.lastCall[0];
	}

	test("falls back to `http://` when no `X-Forwarded-Proto` header is set", async ({
		expect,
	}) => {
		const mf = await listen();
		const url = await dispatchUpgrade(expect, mf, {
			Host: `127.0.0.1:${port}`,
		});
		expect(`${url}`).toBe(`http://127.0.0.1:${port}/`);
	});

	test("honors the `X-Forwarded-Proto` header set to `https`", async ({
		expect,
	}) => {
		const mf = await listen();
		const url = await dispatchUpgrade(expect, mf, {
			Host: `127.0.0.1:${port}`,
			"X-Forwarded-Proto": "https",
		});
		expect(`${url}`).toBe(`https://127.0.0.1:${port}/`);
	});

	test("uses the left-most value when `X-Forwarded-Proto` is a proxy chain", async ({
		expect,
	}) => {
		const mf = await listen();
		const url = await dispatchUpgrade(expect, mf, {
			Host: `127.0.0.1:${port}`,
			"X-Forwarded-Proto": "https, http",
		});
		expect(`${url}`).toBe(`https://127.0.0.1:${port}/`);
	});

	test("ignores `X-Forwarded-Proto` when it holds an unsupported value", async ({
		expect,
	}) => {
		const mf = await listen();
		const url = await dispatchUpgrade(expect, mf, {
			Host: `127.0.0.1:${port}`,
			"X-Forwarded-Proto": "ws",
		});
		expect(`${url}`).toBe(`http://127.0.0.1:${port}/`);
	});

	// https://github.com/cloudflare/workers-sdk/issues/10390
	test("does not forward framing headers from the Worker response", async ({
		expect,
	}) => {
		// Defense in depth: even if a Worker returns framing headers, they
		// must not leak onto the 101 response (no body, so they're nonsensical).
		// Handshake headers (`Sec-WebSocket-*`, `Connection`, `Upgrade`) are
		// rejected upstream by miniflare's own validation before reaching the
		// forwarding code, so they're not exercised here.
		startMiniflare(`export default {
			fetch() {
				const [client, server] = Object.values(new WebSocketPair());
				server.accept();
				const headers = new Headers({
					"X-Hello": "testing",
					"Transfer-Encoding": "chunked",
					"Content-Length": "42",
				});
				return new Response(null, {
					status: 101,
					webSocket: client,
					headers,
				});
			}
		}`);
		await listen();

		const socket = await connect();

		const chunks: Buffer[] = [];
		socket.on("data", (chunk) => chunks.push(chunk));

		socket.write(
			"GET / HTTP/1.1\r\n" +
				`Host: 127.0.0.1:${port}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		await vi.waitFor(
			() => {
				const raw = Buffer.concat(chunks).toString("utf8");
				expect(raw).toContain("HTTP/1.1 101");
				expect(raw).toContain("\r\n\r\n");
			},
			{ timeout: 10_000 }
		);

		const raw = Buffer.concat(chunks).toString("utf8");
		const headerBlock = raw.slice(0, raw.indexOf("\r\n\r\n"));

		// Non-excluded header still forwarded.
		expect(headerBlock).toContain("x-hello: testing");

		// Excluded framing headers must NOT appear on the 101 response.
		expect(headerBlock).not.toMatch(/Transfer-Encoding: chunked/i);
		expect(headerBlock).not.toMatch(/Content-Length: 42/i);

		socket.destroy();
	});

	// https://github.com/cloudflare/workers-sdk/issues/10390
	test("forwards response headers from the Worker on the 101 upgrade response", async ({
		expect,
	}) => {
		// Override the default Miniflare instance with a Worker that returns
		// custom headers (including two Set-Cookie entries) on the upgrade
		// response.
		startMiniflare(`export default {
			fetch() {
				const [client, server] = Object.values(new WebSocketPair());
				server.accept();
				const headers = new Headers({ "X-Hello": "testing" });
				headers.append("Set-Cookie", "session=abc; Path=/");
				headers.append("Set-Cookie", "theme=dark; Path=/; HttpOnly");
				return new Response(null, {
					status: 101,
					webSocket: client,
					headers,
				});
			}
		}`);
		await listen();

		const socket = await connect();

		const chunks: Buffer[] = [];
		socket.on("data", (chunk) => chunks.push(chunk));

		socket.write(
			"GET / HTTP/1.1\r\n" +
				`Host: 127.0.0.1:${port}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		await vi.waitFor(
			() => {
				const raw = Buffer.concat(chunks).toString("utf8");
				expect(raw).toContain("HTTP/1.1 101");
				expect(raw).toContain("\r\n\r\n");
			},
			{ timeout: 10_000 }
		);

		const raw = Buffer.concat(chunks).toString("utf8");
		const headerBlock = raw.slice(0, raw.indexOf("\r\n\r\n"));

		// Fetch `Headers` normalize names to lowercase; `Set-Cookie` keeps its
		// canonical casing because it is appended manually via `getSetCookie()`.
		expect(headerBlock).toContain("x-hello: testing");
		expect(headerBlock).toContain("Set-Cookie: session=abc; Path=/");
		expect(headerBlock).toContain("Set-Cookie: theme=dark; Path=/; HttpOnly");

		socket.destroy();
	});

	test("destroys the socket without an unhandled rejection when dispatchFetch fails", async ({
		expect,
	}) => {
		const mf = await listen();

		// Simulate Miniflare being disposed mid-upgrade: `dispatchFetch` rejects.
		vi.spyOn(mf, "dispatchFetch").mockRejectedValue(
			new Error("Cannot use disposed instance")
		);

		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		onTestFinished(() => {
			process.off("unhandledRejection", unhandled);
		});

		const socket = await connect();
		const closed = new Promise<void>((resolve) =>
			socket.on("close", () => resolve())
		);

		socket.write(
			"GET / HTTP/1.1\r\n" +
				`Host: 127.0.0.1:${port}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);

		// The handler catches the rejection and tears the socket down.
		await closed;
		// Give any (incorrectly) unhandled rejection a tick to surface.
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(unhandled).not.toHaveBeenCalled();
	});
});
