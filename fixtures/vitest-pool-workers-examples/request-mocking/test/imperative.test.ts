import events from "node:events";
import { SELF } from "cloudflare:test";
import { afterEach, assert, it, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
});

it("mocks GET requests", async ({ expect }) => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);

		if (
			request.method === "GET" &&
			url.origin === "https://cloudflare.com" &&
			url.pathname === "/path"
		) {
			return new Response("✅");
		}

		throw new Error("No mock found");
	});

	// Host `example.com` will be rewritten to `cloudflare.com` by the Worker
	let response = await SELF.fetch("https://example.com/path");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");

	// Invalid paths shouldn't match
	response = await SELF.fetch("https://example.com/bad");
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch("No mock found");
});

it("mocks POST requests", async ({ expect }) => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		const body = await request.text();

		if (
			request.method === "POST" &&
			url.origin === "https://cloudflare.com" &&
			url.pathname === "/path" &&
			body === "✨"
		) {
			return new Response("✅");
		}

		throw new Error("No mock found");
	});

	const response = await SELF.fetch("https://example.com/path", {
		method: "POST",
		body: "✨",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("✅");
});

it("mocks WebSocket requests", async ({ expect }) => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);

		if (
			request.method === "GET" &&
			url.origin === "https://cloudflare.com" &&
			url.pathname === "/ws" &&
			request.headers.get("Upgrade") === "websocket"
		) {
			const { 0: socket, 1: responseSocket } = new WebSocketPair();
			socket.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				socket.send(event.data.toUpperCase());
			});
			socket.accept();
			return new Response(null, {
				status: 101,
				webSocket: responseSocket,
			});
		}

		throw new Error("No mock found");
	});

	// Send WebSocket request and assert WebSocket response received...
	const response = await SELF.fetch("https://example.com/ws", {
		headers: { Upgrade: "websocket" },
	});
	expect(response.status).toBe(101);
	const webSocket = response.webSocket;
	assert(webSocket !== null); // Using `assert()` for type narrowing

	// ...then accept WebSocket and send/receive message
	const eventPromise = events.once(webSocket, "message") as Promise<
		[MessageEvent] /* args */
	>;
	webSocket.accept();
	webSocket.send("hello");
	const args = await eventPromise;
	expect(args[0].data).toBe("HELLO");
});
