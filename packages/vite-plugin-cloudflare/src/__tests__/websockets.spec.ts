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
	// Server-side sockets hijacked by a test's own `upgrade` listener: nothing
	// reads from them once upgraded, so `httpServer.close()` would wait forever.
	const hijackedSockets = new Set<net.Socket>();

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
		for (const socket of hijackedSockets) {
			socket.destroy();
		}
		hijackedSockets.clear();
		httpServer?.closeAllConnections();
		await miniflare?.dispose();
		await new Promise<void>((resolve, reject) =>
			httpServer?.close((e) =>
				// Tests that close the server themselves leave nothing to close.
				!e || (e as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING"
					? resolve()
					: reject(e)
			)
		);
	});

	/** Sends a raw WebSocket upgrade request. */
	function writeUpgrade(
		socket: net.Socket,
		{ path = "/", host = `127.0.0.1:${port}` } = {}
	) {
		socket.write(
			`GET ${path} HTTP/1.1\r\n` +
				`Host: ${host}\r\n` +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
				"Sec-WebSocket-Version: 13\r\n\r\n"
		);
	}

	/** Accumulates everything the server writes back on a socket. */
	function record(socket: net.Socket) {
		const chunks: Buffer[] = [];
		socket.on("data", (chunk) => chunks.push(chunk));
		return () => Buffer.concat(chunks).toString("utf8");
	}

	/**
	 * Registers another `upgrade` listener that completes the handshake itself,
	 * optionally only once `gate` resolves (a delayed asynchronous owner).
	 */
	function addOtherOwner({
		register = "on",
		gate,
	}: {
		register?: "on" | "once" | "prependOnceListener";
		gate?: Promise<unknown>;
	} = {}) {
		const claimed = new DeferredPromise<void>();
		httpServer[register]("upgrade", async (_request, socket: net.Socket) => {
			hijackedSockets.add(socket);
			await gate;
			socket.write(
				"HTTP/1.1 101 Switching Protocols\r\n" +
					"Upgrade: websocket\r\n" +
					"Connection: Upgrade\r\n\r\n"
			);
			claimed.resolve();
		});
		return claimed;
	}

	/** Registers an `upgrade` listener that could own the socket but never does. */
	function addPassiveListener() {
		httpServer.on("upgrade", () => {});
	}

	/** Mocks the Worker returning a plain (non-upgrade) response. */
	function mockUnrouted(mf: Miniflare) {
		return vi
			.spyOn(mf, "dispatchFetch")
			.mockResolvedValue(new Response("Not Found", { status: 404 }));
	}

	/** Gives the handler time to (incorrectly) tear a preserved socket down. */
	async function settle() {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

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

	// Node invokes every registered `upgrade` listener, so these cover the
	// ownership rules between this handler and other listeners on the server.
	// https://github.com/cloudflare/workers-sdk/issues/15654
	describe("shared `upgrade` listeners", () => {
		test("leaves a socket claimed by a later listener open", async ({
			expect,
		}) => {
			const mf = await listen();
			const dispatchFetch = mockUnrouted(mf);
			const claimed = addOtherOwner();

			const socket = await connect();
			const received = record(socket);
			writeUpgrade(socket, { path: "/__devtools/__ws" });

			await claimed;
			await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
			await settle();

			expect(received()).toContain("HTTP/1.1 101");
			expect(socket.closed).toBe(false);
		});

		test("leaves a socket claimed by a listener registered before setup open", async ({
			expect,
		}) => {
			const claimed = addOtherOwner();
			const mf = await listen();
			const dispatchFetch = mockUnrouted(mf);

			const socket = await connect();
			const received = record(socket);
			writeUpgrade(socket);

			await claimed;
			await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
			await settle();

			expect(received()).toContain("HTTP/1.1 101");
			expect(socket.closed).toBe(false);
		});

		test.for(["on", "once", "prependOnceListener"] as const)(
			"leaves a socket open for a delayed owner registered with `%s`",
			async (register, { expect }) => {
				const mf = await listen();
				const dispatchFetch = mockUnrouted(mf);
				const gate = new DeferredPromise<void>();
				const claimed = addOtherOwner({ register, gate });

				const socket = await connect();
				const received = record(socket);
				writeUpgrade(socket);

				// The owner only claims the socket after this handler has given up.
				await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
				await settle();
				expect(socket.closed).toBe(false);

				gate.resolve();
				await claimed;
				await settle();

				expect(received()).toContain("HTTP/1.1 101");
				expect(socket.closed).toBe(false);
			}
		);

		test("leaves a socket open for another listener when the host is malformed", async ({
			expect,
		}) => {
			await listen();
			const claimed = addOtherOwner();

			const socket = await connect();
			const received = record(socket);
			writeUpgrade(socket, { host: "[malformed" });

			await claimed;
			await settle();

			expect(received()).toContain("HTTP/1.1 101");
			expect(socket.closed).toBe(false);
		});

		test("closes a malformed-host upgrade when no other listener could own it", async ({
			expect,
		}) => {
			await listen();

			const socket = await connect();
			writeUpgrade(socket, { host: "[malformed" });

			await vi.waitFor(() => expect(socket.closed).toBe(true));
		});

		test("closes an unrouted upgrade when no other listener could own it", async ({
			expect,
		}) => {
			const mf = await listen();
			mockUnrouted(mf);

			const socket = await connect();
			writeUpgrade(socket);

			await vi.waitFor(() => expect(socket.closed).toBe(true));
		});

		test("leaves the socket alone when dispatchFetch fails and another listener could own it", async ({
			expect,
		}) => {
			const mf = await listen();
			const dispatchFetch = vi
				.spyOn(mf, "dispatchFetch")
				.mockRejectedValue(new Error("Cannot use disposed instance"));
			addPassiveListener();

			const unhandled = vi.fn();
			process.on("unhandledRejection", unhandled);
			onTestFinished(() => {
				process.off("unhandledRejection", unhandled);
			});

			const socket = await connect();
			writeUpgrade(socket);

			await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
			await settle();

			expect(socket.closed).toBe(false);
			expect(unhandled).not.toHaveBeenCalled();
		});

		test("does not upgrade a Worker route claimed while dispatchFetch was pending", async ({
			expect,
		}) => {
			const mf = await listen();
			const gate = new DeferredPromise<void>();
			const dispatchFetch = mf.dispatchFetch.bind(mf);
			vi.spyOn(mf, "dispatchFetch").mockImplementation(async (...args) => {
				await gate;
				return dispatchFetch(...args);
			});
			const claimed = addOtherOwner();

			const socket = await connect();
			const received = record(socket);
			writeUpgrade(socket);

			await claimed;
			gate.resolve();
			await settle();

			expect(received().match(/HTTP\/1.1 101/g)).toHaveLength(1);
			expect(received().toLowerCase()).not.toContain("sec-websocket-accept");
			expect(socket.closed).toBe(false);
		});

		test("upgrades a Worker route on a reused keep-alive connection", async ({
			expect,
		}) => {
			await listen();

			const socket = await connect();
			const received = record(socket);

			// Bytes from an earlier response on this connection must not read as
			// another listener having claimed the upgrade that follows.
			socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
			await vi.waitFor(() => expect(received()).toContain("HTTP/1.1 200"));

			writeUpgrade(socket);

			await vi.waitFor(() => expect(received()).toContain("HTTP/1.1 101"), {
				timeout: 10_000,
			});
			expect(received().toLowerCase()).toContain("sec-websocket-accept");
		});

		test("repeated setup installs a single listener and dispatches once", async ({
			expect,
		}) => {
			const mf = await listen();
			handleWebSocket(httpServer, mf);
			handleWebSocket(httpServer, mf);
			const dispatchFetch = mockUnrouted(mf);

			expect(httpServer.listenerCount("upgrade")).toBe(1);

			const socket = await connect();
			writeUpgrade(socket);

			await vi.waitFor(() => expect(socket.closed).toBe(true));
			expect(dispatchFetch).toHaveBeenCalledTimes(1);
		});

		test("closes the server even when an upgrade was preserved for another listener", async ({
			expect,
		}) => {
			const mf = await listen();
			const dispatchFetch = mockUnrouted(mf);
			addPassiveListener();

			const socket = await connect();
			writeUpgrade(socket);

			await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
			await settle();
			expect(socket.closed).toBe(false);

			await new Promise<void>((resolve, reject) =>
				httpServer.close((e) => (e ? reject(e) : resolve()))
			);
		});

		test("preserves shared upgrades again after the server is restarted", async ({
			expect,
		}) => {
			const mf = await listen();
			const dispatchFetch = mockUnrouted(mf);
			const claimed = addOtherOwner();

			await new Promise<void>((resolve, reject) =>
				httpServer.close((e) => (e ? reject(e) : resolve()))
			);
			await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
			port = (httpServer.address() as AddressInfo).port;

			const socket = await connect();
			const received = record(socket);
			writeUpgrade(socket);

			await claimed;
			await vi.waitFor(() => expect(dispatchFetch).toHaveBeenCalled());
			await settle();

			expect(received()).toContain("HTTP/1.1 101");
			expect(socket.closed).toBe(false);
		});
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
