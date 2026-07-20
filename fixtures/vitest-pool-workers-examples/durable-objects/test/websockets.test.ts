import { env } from "cloudflare:workers";
import { it } from "vitest";

const orderingAttempts = 5;
const orderingMessages = 100;

function expectedOrderingMessages() {
	return Array.from({ length: orderingMessages }, (_, i) => `message-${i}`);
}

function getMessageData(event: MessageEvent) {
	if (typeof event.data === "string") {
		return event.data;
	}
	if (event.data instanceof ArrayBuffer) {
		return new TextDecoder().decode(event.data);
	}
	throw new TypeError(
		`Unexpected WebSocket message type: ${typeof event.data}`
	);
}

function waitForMessages(socket: WebSocket, count: number) {
	return new Promise<string[]>((resolve, reject) => {
		const messages: string[] = [];
		const timeout = setTimeout(() => {
			reject(new Error(`Timed out waiting for ${count} WebSocket messages`));
		}, 10_000);

		socket.addEventListener("message", (event) => {
			messages.push(getMessageData(event));
			if (messages.length === count) {
				clearTimeout(timeout);
				resolve(messages);
			}
		});
		socket.addEventListener("error", () => {
			clearTimeout(timeout);
			reject(new Error("WebSocket error while waiting for messages"));
		});
	});
}

function getResponseWebSocket(response: Response) {
	const socket = response.webSocket;
	if (socket === null || socket === undefined) {
		throw new TypeError("Expected WebSocket response");
	}
	return socket;
}

it("dispatches to a Durable Object that omits optional WebSocket handlers", async ({
	expect,
}) => {
	const id = env.OPTIONAL_WS.idFromName(
		`optional-websocket-handlers-${crypto.randomUUID()}`
	);
	const stub = env.OPTIONAL_WS.get(id);
	const response = await stub.fetch("https://example.com/", {
		headers: { Upgrade: "websocket" },
	});
	const socket = getResponseWebSocket(response);
	const messagesPromise = waitForMessages(socket, 1);

	socket.accept();
	socket.send("hello");
	expect(await messagesPromise).toEqual(["echo:hello"]);

	// `OptionalWebSocketHandlers` defines no `webSocketClose()`. Closing used to
	// throw "does not define a `webSocketClose()` method" inside the Durable
	// Object; it must be a silent no-op, as it is on deployed Workers.
	socket.close(1000, "done");
	await scheduler.wait(1000);

	// The Durable Object survived the close and still serves new connections.
	const secondResponse = await stub.fetch("https://example.com/", {
		headers: { Upgrade: "websocket" },
	});
	const secondSocket = getResponseWebSocket(secondResponse);
	const secondMessages = waitForMessages(secondSocket, 1);
	secondSocket.accept();
	secondSocket.send("still-here");
	expect(await secondMessages).toEqual(["echo:still-here"]);
});

it("preserves hibernatable WebSocket message order", async ({ expect }) => {
	for (let attempt = 0; attempt < orderingAttempts; attempt++) {
		const id = env.COUNTER.idFromName(
			`websocket-ordering-${crypto.randomUUID()}-${attempt}`
		);
		const stub = env.COUNTER.get(id);
		const response = await stub.fetch("https://example.com/websocket-order", {
			headers: { Upgrade: "websocket" },
		});
		const socket = getResponseWebSocket(response);
		const expected = expectedOrderingMessages();
		const messagesPromise = waitForMessages(socket, orderingMessages);

		socket.accept();
		for (const message of expected) {
			socket.send(message);
		}

		expect(await messagesPromise).toEqual(expected);

		const logResponse = await stub.fetch(
			"https://example.com/websocket-order-log"
		);
		expect(await logResponse.json()).toEqual(expected);

		socket.close(1000, "done");
	}
});
