import {
	evictAllDurableObjects,
	evictDurableObject,
	runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { it } from "vitest";
import { Counter } from "../src/";

function getResponseWebSocket(response: Response) {
	const socket = response.webSocket;
	if (socket === null || socket === undefined) {
		throw new TypeError("Expected WebSocket response");
	}
	return socket;
}

function waitForMessage(socket: WebSocket) {
	return new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Timed out waiting for WebSocket message"));
		}, 10_000);
		socket.addEventListener("message", (event) => {
			clearTimeout(timeout);
			resolve(
				typeof event.data === "string"
					? event.data
					: new TextDecoder().decode(event.data as ArrayBuffer)
			);
		});
		socket.addEventListener("error", () => {
			clearTimeout(timeout);
			reject(new Error("WebSocket error while waiting for message"));
		});
	});
}

function waitForClose(socket: WebSocket) {
	return new Promise<CloseEvent>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Timed out waiting for WebSocket close"));
		}, 10_000);
		socket.addEventListener("close", (event) => {
			clearTimeout(timeout);
			resolve(event);
		});
		socket.addEventListener("error", () => {
			clearTimeout(timeout);
			reject(new Error("WebSocket error while waiting for close"));
		});
	});
}

it("resets in-memory state but preserves storage on targeted eviction", async ({
	expect,
}) => {
	const id = env.COUNTER.idFromName(`evict-${crypto.randomUUID()}`);
	const stub = env.COUNTER.get(id);

	// Persist `count = 2` through the `fetch()` handler
	expect(await (await stub.fetch("https://example.com/")).text()).toBe("1");
	expect(await (await stub.fetch("https://example.com/")).text()).toBe("2");

	// Corrupt in-memory state without persisting it to storage
	await runInDurableObject(stub, (instance: Counter) => {
		instance.count = 999;
	});

	await evictDurableObject(stub, { webSockets: "hibernate" });

	// After eviction the instance is torn down: the in-memory `999` is discarded
	// and `count` is reloaded from storage (`2`), so the next increment yields `3`
	expect(await (await stub.fetch("https://example.com/")).text()).toBe("3");
});

it("resets all running instances with bulk eviction", async ({ expect }) => {
	const id = env.COUNTER.idFromName(`evict-all-${crypto.randomUUID()}`);
	const stub = env.COUNTER.get(id);

	expect(await (await stub.fetch("https://example.com/")).text()).toBe("1");
	await runInDurableObject(stub, (instance: Counter) => {
		instance.count = 999;
	});

	await evictAllDurableObjects();

	expect(await (await stub.fetch("https://example.com/")).text()).toBe("2");
});

it("hibernates WebSockets across eviction", async ({ expect }) => {
	const id = env.COUNTER.idFromName(`evict-ws-${crypto.randomUUID()}`);
	const stub = env.COUNTER.get(id);
	const response = await stub.fetch("https://example.com/websocket-order", {
		headers: { Upgrade: "websocket" },
	});
	const socket = getResponseWebSocket(response);
	socket.accept();

	await evictDurableObject(stub);

	// The WebSocket should be hibernated rather than closed, so messages still
	// round-trip after eviction (waking the Durable Object back up)
	const messagePromise = waitForMessage(socket);
	socket.send("after-eviction");
	expect(await messagePromise).toBe("after-eviction");
	socket.close(1000, "done");
});

it("closes WebSockets when requested during eviction", async ({ expect }) => {
	const id = env.COUNTER.idFromName(`evict-ws-close-${crypto.randomUUID()}`);
	const stub = env.COUNTER.get(id);
	const response = await stub.fetch("https://example.com/websocket-order", {
		headers: { Upgrade: "websocket" },
	});
	const socket = getResponseWebSocket(response);
	socket.accept();

	const closePromise = waitForClose(socket);
	await evictDurableObject(stub, { webSockets: "close" });
	expect(await closePromise).toBeDefined();
});
