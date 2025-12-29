import assert from "node:assert";
import { Blob } from "node:buffer";
import http from "node:http";
import { AddressInfo } from "node:net";
import { URLSearchParams } from "node:url";
import {
	CloseEvent,
	DeferredPromise,
	fetch,
	FormData,
	MessageEvent,
} from "miniflare";
import { expect, onTestFinished, test } from "vitest";
import { WebSocketServer } from "ws";
import { useServer } from "../test-shared";

const noop = () => {};

test("fetch: performs regular http request", async () => {
	const upstream = (await useServer((req, res) => res.end("upstream"))).http;
	const res = await fetch(upstream);
	expect(await res.text()).toBe("upstream");
});
test("fetch: performs http request with form data", async () => {
	const echoUpstream = (
		await useServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => res.end(body));
		})
	).http;
	const body = new FormData();
	body.append("a", "1");
	body.append("b", new URLSearchParams({ x: "1", y: "2", z: "3" }));
	body.append("c", new Blob(["abc"]), "file.txt");
	const res = await fetch(echoUpstream, { method: "POST", body });
	const text = await res.text();
	expect(text).toMatch(/Content-Disposition: form-data; name="a"\r\n\r\n1/);
	expect(text).toMatch(
		/Content-Disposition: form-data; name="b"\r\n\r\nx=1&y=2&z=3/
	);
	expect(text).toMatch(
		/Content-Disposition: form-data; name="c"; filename="file.txt"\r\nContent-Type: application\/octet-stream\r\n\r\nabc/
	);
});
test("fetch: performs web socket upgrade", async () => {
	const server = await useServer(noop, (ws, req) => {
		ws.send("hello client");
		ws.send(req.headers["user-agent"] ?? "");
		ws.addEventListener("message", ({ data }) => ws.send(data));
	});
	const res = await fetch(server.http, {
		headers: { upgrade: "websocket", "user-agent": "Test" },
	});
	const webSocket = res.webSocket;
	expect(webSocket).toBeDefined();
	assert(webSocket);

	const eventPromise = new DeferredPromise<void>();
	const messages: MessageEvent["data"][] = [];
	webSocket.addEventListener("message", (e) => {
		messages.push(e.data);
		if (e.data === "hello server") eventPromise.resolve();
	});
	webSocket.accept();
	webSocket.send("hello server");

	await eventPromise;
	expect(messages).toEqual(["hello client", "Test", "hello server"]);
});
test("fetch: performs web socket upgrade with Sec-WebSocket-Protocol header", async () => {
	const server = await useServer(noop, (ws, req) => {
		ws.send(req.headers["sec-websocket-protocol"] ?? "");
	});
	const res = await fetch(server.http, {
		headers: {
			upgrade: "websocket",
			"Sec-WebSocket-Protocol": "protocol1, proto2,p3",
		},
	});
	const webSocket = res.webSocket;
	expect(webSocket).toBeDefined();
	assert(webSocket);
	const eventPromise = new DeferredPromise<MessageEvent>();
	webSocket.addEventListener("message", eventPromise.resolve);
	webSocket.accept();

	const event = await eventPromise;
	expect(event.data).toBe("protocol1,proto2,p3");
});
test("fetch: includes headers from web socket upgrade response", async () => {
	const server = http.createServer();
	const wss = new WebSocketServer({ server });
	wss.on("connection", (ws) => {
		ws.send("hello");
		ws.close();
	});
	wss.on("headers", (headers) => {
		headers.push("Set-Cookie: key=value");
	});
	const port = await new Promise<number>((resolve) => {
		server.listen(0, () => {
			onTestFinished(() => {
				server.close();
			});
			resolve((server.address() as AddressInfo).port);
		});
	});
	const res = await fetch(`http://localhost:${port}`, {
		headers: { upgrade: "websocket" },
	});
	expect(res.webSocket).toBeDefined();
	expect(res.headers.getSetCookie()[0]).toBe("key=value");
});
test(
	"fetch: dispatches close events on client and server close",
	{ retry: 3 },
	async () => {
		let clientCloses = 0;
		let serverCloses = 0;
		const clientClosePromise = new DeferredPromise<void>();
		const serverClosePromise = new DeferredPromise<void>();

		const server = await useServer(noop, (ws, req) => {
			if (req.url?.startsWith("/client")) {
				ws.on("close", (code, reason) => {
					expect(code).toBe(3001);
					expect(reason.toString()).toBe("Client Close");
					if (req.url === "/client/event-listener") {
						ws.close(3002, "Server Event Listener Close");
					}

					clientCloses++;
					if (clientCloses === 2) clientClosePromise.resolve();
				});
			} else if (req.url === "/server") {
				ws.on("message", (data) => {
					if (data.toString() === "close") ws.close(3003, "Server Close");
				});
				ws.on("close", (code, reason) => {
					expect(code).toBe(3003);
					expect(reason.toString()).toBe("Server Close");

					serverCloses++;
					if (serverCloses === 2) serverClosePromise.resolve();
				});
			}
		});

		// Check client-side close
		async function clientSideClose(closeInEventListener: boolean) {
			const path = closeInEventListener ? "/client/event-listener" : "/client";
			const res = await fetch(new URL(path, server.http), {
				headers: { upgrade: "websocket" },
			});
			const webSocket = res.webSocket;
			assert(webSocket);
			const closeEventPromise = new DeferredPromise<CloseEvent>();
			webSocket.addEventListener("close", closeEventPromise.resolve);
			webSocket.accept();
			webSocket.close(3001, "Client Close");
			const closeEvent = await closeEventPromise;
			expect(closeEvent.code).toBe(3001);
			expect(closeEvent.reason).toBe("Client Close");
		}
		await clientSideClose(false);
		await clientSideClose(true);
		await clientClosePromise;

		// Check server-side close
		async function serverSideClose(closeInEventListener: boolean) {
			const res = await fetch(new URL("/server", server.http), {
				headers: { upgrade: "websocket" },
			});
			const webSocket = res.webSocket;
			assert(webSocket);
			const closeEventPromise = new DeferredPromise<CloseEvent>();
			webSocket.addEventListener("close", (event) => {
				if (closeInEventListener) {
					webSocket.close(3004, "Client Event Listener Close");
				}
				closeEventPromise.resolve(event);
			});
			webSocket.accept();
			webSocket.send("close");
			const closeEvent = await closeEventPromise;
			expect(closeEvent.code).toBe(3003);
			expect(closeEvent.reason).toBe("Server Close");
		}
		await serverSideClose(false);
		await serverSideClose(true);
		await serverClosePromise;
	}
);
test("fetch: throws on ws(s) protocols", async () => {
	await expect(
		fetch("ws://localhost/", {
			headers: { upgrade: "websocket" },
		})
	).rejects.toThrow(
		new TypeError(
			"Fetch API cannot load: ws://localhost/.\nMake sure you're using http(s):// URLs for WebSocket requests via fetch."
		)
	);
	await expect(
		fetch("wss://localhost/", {
			headers: { upgrade: "websocket" },
		})
	).rejects.toThrow(
		new TypeError(
			"Fetch API cannot load: wss://localhost/.\nMake sure you're using http(s):// URLs for WebSocket requests via fetch."
		)
	);
});
test("fetch: requires GET for web socket upgrade", async () => {
	const server = await useServer(
		(req, res) => {
			expect(req.method).toBe("POST");
			res.end("http response");
		},
		() => {
			throw new Error("Test failed");
		}
	);
	await expect(
		fetch(server.http, {
			method: "POST",
			headers: { upgrade: "websocket" },
		})
	).rejects.toThrow(new TypeError("fetch failed"));
});
test("fetch: returns regular response if no WebSocket response returned", async () => {
	const server = await useServer((req, res) => {
		res.writeHead(404, "Not Found", { "Content-Type": "text/html" });
		res.end("<p>Not Found</p>");
	});
	const res = await fetch(server.http, { headers: { upgrade: "websocket" } });
	expect(res.status).toBe(404);
	expect(res.headers.get("Content-Type")).toBe("text/html");
	expect(await res.text()).toBe("<p>Not Found</p>");
});
