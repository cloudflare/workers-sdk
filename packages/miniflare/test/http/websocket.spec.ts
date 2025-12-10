import assert from "node:assert";
import http from "node:http";
import { AddressInfo } from "node:net";
import { setImmediate } from "node:timers/promises";
import test from "ava";
import { expectTypeOf } from "expect-type";
import {
	CloseEvent,
	coupleWebSocket,
	DeferredPromise,
	MessageEvent,
	viewToBuffer,
	WebSocket,
	WebSocketPair,
} from "miniflare";
import NodeWebSocket, { Event as WebSocketEvent, WebSocketServer } from "ws";
import { useServer, utf8Decode, utf8Encode } from "../test-shared";

const noop = () => {};

test("WebSocket: can accept multiple times", (t) => {
	const webSocket = new WebSocket();
	webSocket.accept();
	webSocket.accept();
	t.pass();
});
test("WebSocket: cannot accept if already coupled", async (t) => {
	const server = await useServer(t, noop, (ws) => ws.send("test"));
	const ws = new NodeWebSocket(server.ws);
	const [webSocket1] = Object.values(new WebSocketPair());
	await coupleWebSocket(ws, webSocket1);
	t.throws(() => webSocket1.accept(), {
		instanceOf: TypeError,
		message: "Can't accept() WebSocket that was already used in a response.",
	});
});
test("WebSocket: sends message to pair", async (t) => {
	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());
	webSocket1.accept();
	webSocket2.accept();

	const messages1: MessageEvent["data"][] = [];
	const messages2: MessageEvent["data"][] = [];
	webSocket1.addEventListener("message", (e) => messages1.push(e.data));
	webSocket2.addEventListener("message", (e) => messages2.push(e.data));

	webSocket1.send("from1");
	await setImmediate();
	t.deepEqual(messages1, []);
	t.deepEqual(messages2, ["from1"]);
	webSocket2.send("from2");
	await setImmediate();
	t.deepEqual(messages1, ["from2"]);
	t.deepEqual(messages2, ["from1"]);
});
test("WebSocket: must accept before sending", (t) => {
	const [webSocket1] = Object.values(new WebSocketPair());
	t.throws(() => webSocket1.send("test"), {
		instanceOf: TypeError,
		message:
			"You must call accept() on this WebSocket before sending messages.",
	});
});
test("WebSocket: queues messages if pair not accepted", async (t) => {
	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());

	const messages1: MessageEvent["data"][] = [];
	const messages2: MessageEvent["data"][] = [];
	webSocket1.addEventListener("message", (e) => messages1.push(e.data));
	webSocket2.addEventListener("message", (e) => messages2.push(e.data));

	webSocket1.accept();
	webSocket1.send("from1_1");
	await setImmediate();
	t.deepEqual(messages1, []);
	t.deepEqual(messages2, []);

	webSocket2.accept();
	webSocket2.send("from2_1");
	await setImmediate();
	t.deepEqual(messages1, ["from2_1"]);
	t.deepEqual(messages2, ["from1_1"]);

	webSocket1.send("from1_2");
	webSocket2.send("from2_2");
	await setImmediate();
	t.deepEqual(messages1, ["from2_1", "from2_2"]);
	t.deepEqual(messages2, ["from1_1", "from1_2"]);
});
test("WebSocket: queues closes if pair not accepted", async (t) => {
	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());

	let closeEvent1: CloseEvent | undefined;
	let closeEvent2: CloseEvent | undefined;
	webSocket1.addEventListener("close", (e) => (closeEvent1 = e));
	webSocket2.addEventListener("close", (e) => (closeEvent2 = e));

	webSocket1.accept();
	webSocket1.close(3001, "from1");
	await setImmediate();
	t.is(closeEvent1, undefined);
	t.is(closeEvent2, undefined);

	webSocket2.accept();
	t.is(closeEvent2?.code, 3001);
	t.is(closeEvent2?.reason, "from1");
	webSocket2.close(3002, "from2");
	await setImmediate();
	t.is(closeEvent1?.code, 3002);
	t.is(closeEvent1?.reason, "from2");
});
test("WebSocket: discards sent message to pair if other side closed", async (t) => {
	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());

	const messages1: MessageEvent["data"][] = [];
	const messages2: MessageEvent["data"][] = [];
	webSocket1.addEventListener("message", (e) => messages1.push(e.data));
	webSocket2.addEventListener("message", (e) => messages2.push(e.data));

	webSocket1.accept();
	webSocket2.accept();
	webSocket1.close();
	t.throws(() => webSocket1.send("from1"), {
		instanceOf: Error,
		message: "Can't call WebSocket send() after close().",
	});
	await setImmediate();
	t.deepEqual(messages1, []);
	t.deepEqual(messages2, []);

	// Message sent from non-close()d side received
	webSocket2.send("from2");
	await setImmediate();
	t.deepEqual(messages1, ["from2"]);
	t.deepEqual(messages2, []);
});
test("WebSocket: closes both sides of pair", async (t) => {
	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());
	webSocket1.accept();
	webSocket2.accept();

	const closes: number[] = [];
	webSocket1.addEventListener("close", () => closes.push(3));
	webSocket2.addEventListener("close", () => {
		closes.push(2);
		webSocket2.close();
	});
	closes.push(1);
	webSocket1.close();
	await setImmediate();

	// Check both event listeners called once
	t.deepEqual(closes, [1, 2, 3]);
});
test("WebSocket: has correct readyStates", async (t) => {
	// Check constants have correct values:
	// https://websockets.spec.whatwg.org/#interface-definition
	t.is(WebSocket.READY_STATE_CONNECTING, 0);
	t.is(WebSocket.READY_STATE_OPEN, 1);
	t.is(WebSocket.READY_STATE_CLOSING, 2);
	t.is(WebSocket.READY_STATE_CLOSED, 3);

	const [webSocket1, webSocket2] = Object.values(new WebSocketPair());
	t.is(webSocket1.readyState, WebSocket.READY_STATE_OPEN);
	t.is(webSocket2.readyState, WebSocket.READY_STATE_OPEN);

	webSocket1.accept();
	webSocket2.accept();

	t.is(webSocket1.readyState, WebSocket.READY_STATE_OPEN);
	t.is(webSocket2.readyState, WebSocket.READY_STATE_OPEN);

	const closePromise = new DeferredPromise<void>();
	webSocket1.addEventListener("close", () => {
		t.is(webSocket1.readyState, WebSocket.READY_STATE_CLOSED);
		t.is(webSocket2.readyState, WebSocket.READY_STATE_CLOSED);
		closePromise.resolve();
	});
	webSocket2.addEventListener("close", () => {
		t.is(webSocket1.readyState, WebSocket.READY_STATE_CLOSING);
		t.is(webSocket2.readyState, WebSocket.READY_STATE_CLOSING);
		webSocket2.close();
	});
	webSocket1.close();
	await closePromise;
});
test("WebSocket: must accept before closing", (t) => {
	const [webSocket1] = Object.values(new WebSocketPair());
	t.throws(() => webSocket1.close(), {
		instanceOf: TypeError,
		message:
			"You must call accept() on this WebSocket before sending messages.",
	});
});
test("WebSocket: can only call close once", (t) => {
	const [webSocket1] = Object.values(new WebSocketPair());
	webSocket1.accept();
	webSocket1.close(1000);
	t.throws(() => webSocket1.close(1000), {
		instanceOf: TypeError,
		message: "WebSocket already closed",
	});
});
test("WebSocket: validates close code", (t) => {
	const [webSocket1] = Object.values(new WebSocketPair());
	webSocket1.accept();
	// Try close with invalid code
	t.throws(() => webSocket1.close(1005 /*No Status Received*/), {
		instanceOf: TypeError,
		message: "Invalid WebSocket close code.",
	});
	// Try close with reason without code
	t.throws(() => webSocket1.close(undefined, "Test Closure"), {
		instanceOf: TypeError,
		message:
			"If you specify a WebSocket close reason, you must also specify a code.",
	});
});

test("WebSocketPair: requires 'new' operator to construct", (t) => {
	// @ts-expect-error this shouldn't type check
	t.throws(() => WebSocketPair(), {
		instanceOf: TypeError,
		message: /^Failed to construct 'WebSocketPair'/,
	});
});
function _testWebSocketPairTypes() {
	const pair = new WebSocketPair();

	let [webSocket1, webSocket2] = Object.values(pair);
	expectTypeOf(webSocket1).not.toBeAny();
	expectTypeOf(webSocket2).not.toBeAny();
	expectTypeOf(webSocket1).toMatchTypeOf<WebSocket>();
	expectTypeOf(webSocket2).toMatchTypeOf<WebSocket>();

	// @ts-expect-error shouldn't be able to destructure array directly
	[webSocket1, webSocket2] = pair;

	webSocket1 = pair[0];
	expectTypeOf(webSocket1).toMatchTypeOf<WebSocket>();
	// @ts-expect-error shouldn't be able to access out-of-bounds
	webSocket2 = pair[2];
}

test("coupleWebSocket: throws if already coupled", async (t) => {
	const server = await useServer(t, noop, (ws) => ws.send("test"));
	const ws = new NodeWebSocket(server.ws);
	const [client] = Object.values(new WebSocketPair());
	await coupleWebSocket(ws, client);
	await t.throwsAsync(coupleWebSocket({} as any, client), {
		instanceOf: TypeError,
		message: "Can't return WebSocket that was already used in a response.",
	});
});
test("coupleWebSocket: throws if already accepted", async (t) => {
	const [client] = Object.values(new WebSocketPair());
	client.accept();
	await t.throwsAsync(coupleWebSocket({} as any, client), {
		instanceOf: TypeError,
		message: "Can't return WebSocket in a Response after calling accept().",
	});
});
test("coupleWebSocket: forwards messages from client to worker before coupling", async (t) => {
	const server = await useServer(t, noop, (ws) => ws.send("test"));
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	// Accept before coupling, simulates accepting in worker code before returning response
	worker.accept();
	const eventPromise = new Promise<MessageEvent>((resolve) => {
		worker.addEventListener("message", resolve);
	});
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.is(event.data, "test");
});
test("coupleWebSocket: forwards messages from client to worker after coupling", async (t) => {
	const server = await useServer(t, noop, (ws) => ws.send("test"));
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	await coupleWebSocket(ws, client);
	// Accept after coupling, simulates accepting in worker code after returning response
	const eventPromise = new Promise<MessageEvent>((resolve) => {
		worker.addEventListener("message", resolve);
	});
	// accept() after addEventListener() as it dispatches queued messages
	worker.accept();

	const event = await eventPromise;
	t.is(event.data, "test");
});
test("coupleWebSocket: forwards binary messages from client to worker", async (t) => {
	const server = await useServer(t, noop, (ws) => {
		ws.send(Buffer.from("test", "utf8"));
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	const eventPromise = new Promise<MessageEvent>((resolve) => {
		worker.addEventListener("message", resolve);
	});
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.true(event.data instanceof ArrayBuffer);
	assert(event.data instanceof ArrayBuffer);
	t.is(utf8Decode(new Uint8Array(event.data)), "test");
});
test("coupleWebSocket: closes worker socket on client close", async (t) => {
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("message", () => ws.close(1000, "Test Closure"));
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());
	worker.accept();
	const eventPromise = new Promise<CloseEvent>((resolve) => {
		worker.addEventListener("close", resolve);
	});

	await coupleWebSocket(ws, client);
	ws.send("test");

	const event = await eventPromise;
	t.is(event.code, 1000);
	t.is(event.reason, "Test Closure");
});
test("coupleWebSocket: closes worker socket with invalid client close code", async (t) => {
	const server = http.createServer();
	const wss = new WebSocketServer({ server });
	wss.on("connection", (ws) => {
		// Close WebSocket without code, defaults to 1005 (No Status Received)
		// which would be an invalid code if passed normally
		ws.close();
	});
	const port = await new Promise<number>((resolve) => {
		server.listen(0, () => {
			resolve((server.address() as AddressInfo).port);
		});
	});
	const ws = new NodeWebSocket(`ws://localhost:${port}`);
	const [client, worker] = Object.values(new WebSocketPair());

	const eventPromise = new DeferredPromise<CloseEvent>();
	worker.addEventListener("close", eventPromise.resolve);
	worker.accept();
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.is(event.code, 1005);
});
test("coupleWebSocket: forwards messages from worker to client before coupling", async (t) => {
	const eventPromise = new DeferredPromise<{ data: any }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("message", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	// Send before coupling, simulates sending message in worker code before returning response
	worker.send("test");
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.is(event.data, "test");
});
test("coupleWebSocket: forwards messages from worker to client after coupling", async (t) => {
	const eventPromise = new DeferredPromise<{ data: any }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("message", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	await coupleWebSocket(ws, client);
	// Send after coupling, simulates sending message in worker code after returning response
	worker.send("test");

	const event = await eventPromise;
	t.is(event.data, "test");
});
test("coupleWebSocket: forwards binary messages from worker to client", async (t) => {
	const eventPromise = new DeferredPromise<{ data: any }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("message", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	worker.send(viewToBuffer(utf8Encode("test")));
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.is(utf8Decode(event.data), "test");
});
test("coupleWebSocket: closes client socket on worker close", async (t) => {
	const eventPromise = new DeferredPromise<{ code: number; reason: string }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("close", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());
	worker.accept();
	await coupleWebSocket(ws, client);
	worker.close(1000, "Test Closure");

	const event = await eventPromise;
	t.is(event.code, 1000);
	t.is(event.reason, "Test Closure");
});
test("coupleWebSocket: closes client socket on worker close with no close code", async (t) => {
	const eventPromise = new DeferredPromise<{ code: number; reason: string }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("close", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());
	worker.accept();
	await coupleWebSocket(ws, client);
	worker.close();

	const event = await eventPromise;
	t.is(event.code, 1005);
});
test("coupleWebSocket: accepts worker socket immediately if already open", async (t) => {
	const eventPromise = new DeferredPromise<{ data: any }>();
	const server = await useServer(t, noop, (ws) => {
		ws.addEventListener("message", eventPromise.resolve);
	});
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	// Send before coupling, simulates sending message in worker code before returning response
	worker.send("test");
	// Make sure socket is open before terminating
	const openPromise = new DeferredPromise<WebSocketEvent>();
	ws.addEventListener("open", openPromise.resolve);
	await openPromise;
	await coupleWebSocket(ws, client);

	const event = await eventPromise;
	t.is(event.data, "test");
});
test("coupleWebSocket: throws if web socket already closed", async (t) => {
	const server = await useServer(t, noop, noop);
	const ws = new NodeWebSocket(server.ws);
	const [client, worker] = Object.values(new WebSocketPair());

	worker.accept();
	// Make sure socket is open before closing
	const openPromise = new DeferredPromise<WebSocketEvent>();
	ws.addEventListener("open", openPromise.resolve);
	await openPromise;
	// Make sure socket is closed before terminating
	ws.close(1000, "Test Closure");
	await t.throwsAsync(coupleWebSocket(ws, client), {
		instanceOf: Error,
		message: "Incoming WebSocket connection already closed.",
	});
});
