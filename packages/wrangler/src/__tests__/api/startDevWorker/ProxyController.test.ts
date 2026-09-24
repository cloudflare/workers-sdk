import { createServer } from "node:net";
import { describe, test, vi } from "vitest";
import { serialiseError } from "../../../api/startDevWorker/events";
import { ProxyController } from "../../../api/startDevWorker/ProxyController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { SerializedError } from "../../../api/startDevWorker/events";
import type { StartDevWorkerOptions } from "../../../api/startDevWorker/types";
import type { AddressInfo, Socket } from "node:net";

describe("ProxyController", () => {
	mockConsoleMethods();

	test("ProxyWorker error reports preserve message/name/stack across the JSON channel", async ({
		expect,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/14641:
		// the ProxyWorker's error reports arrive as JSON-serialized plain objects,
		// and used to be re-wrapped in a message-less Error, so the resulting
		// fatal log was an empty `✘ [ERROR]` with no clue about the failure.
		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		const waited = bus.waitFor("error");

		const original = new Error("Network connection lost.");
		const serialized = JSON.parse(
			JSON.stringify(serialiseError(original))
		) as SerializedError;
		controller.onProxyWorkerMessage({ type: "error", error: serialized });

		const event = await waited;
		expect(event.source).toBe("ProxyController");
		expect(event.reason).toBe("Error inside ProxyWorker");
		expect(event.cause).toBeInstanceOf(Error);
		expect(event.cause.message).toBe("Network connection lost.");
		expect(event.cause.stack).toBe(original.stack);
	});

	test("Runtime.exceptionThrown dispatches a typed runtimeError event", async ({
		expect,
	}) => {
		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		const waited = bus.waitFor("runtimeError");
		controller.onInspectorProxyWorkerMessage({
			method: "Runtime.exceptionThrown",
			params: {
				timestamp: 0,
				exceptionDetails: {
					exceptionId: 1,
					text: "Uncaught Error: boom",
					lineNumber: 0,
					columnNumber: 0,
					exception: {
						type: "object",
						subtype: "error",
						description: "Error: boom\n    at fetch (index.js:1:1)",
					},
				},
			},
		});
		const event = await waited;
		expect(event.source).toBe("ProxyController");
		expect(event.text).toBe("Uncaught Error: boom");
		expect(event.stack).toContain("Error: boom");
		expect(event.exceptionDetails?.exceptionId).toBe(1);
	});

	test("ProxyWorker answers with a 503 once a control request arrives without its payload", async ({
		expect,
		onTestFinished,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/15717:
		// Bun's `fetch()` ignores the undici dispatcher that attaches the
		// `cf.hostMetadata` payload, so control requests arrive authorised but
		// empty, no `play` ever lands, and queued requests used to hang forever.
		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		onTestFinished(() => controller.teardown());

		controller.onConfigUpdate({
			type: "configUpdate",
			config: {
				dev: { inspector: false, server: { hostname: "127.0.0.1", port: 0 } },
			} as StartDevWorkerOptions,
		});
		const { proxyWorker } = await controller.ready.promise;

		// The same control request delivered with its payload is acknowledged,
		// so the 400 below comes from the missing payload alone.
		await expect(
			controller.sendMessageToProxyWorker({ type: "pause" })
		).resolves.toBe(true);

		// Whether this request reaches the ProxyWorker before or after the empty
		// control request, it must be answered rather than left in the queue.
		const sentBefore = proxyWorker.dispatchFetch("http://example.com/before");

		const control = await proxyWorker.dispatchFetch(
			"http://dummy/cdn-cgi/ProxyWorker/play",
			{ headers: { Authorization: controller.secret } }
		);
		expect(control.status).toBe(400);

		for (const response of [
			await sentBefore,
			await proxyWorker.dispatchFetch("http://example.com/after"),
		]) {
			expect(response.status).toBe(503);
			expect(await response.text()).toContain(
				"https://github.com/oven-sh/bun/issues/39247"
			);
		}
	});

	test("ProxyWorker answers with a 503 when a request in flight is retried after a control request arrives without its payload", async ({
		expect,
		onTestFinished,
	}) => {
		// A request that is already forwarded is in neither queue when the empty
		// control request drains them, and its retry is requeued asynchronously
		// once the connection to the old UserWorker fails. With no `play` to
		// come, that retry must get the same 503 rather than wait forever.
		const sockets: Socket[] = [];
		const userWorker = createServer((socket) => sockets.push(socket));
		await new Promise<void>((resolve) =>
			userWorker.listen(0, "127.0.0.1", resolve)
		);
		onTestFinished(
			() => new Promise<void>((resolve) => userWorker.close(() => resolve()))
		);
		const { port } = userWorker.address() as AddressInfo;

		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		onTestFinished(() => controller.teardown());

		controller.onConfigUpdate({
			type: "configUpdate",
			config: {
				dev: { inspector: false, server: { hostname: "127.0.0.1", port: 0 } },
			} as StartDevWorkerOptions,
		});
		const { proxyWorker } = await controller.ready.promise;

		await expect(
			controller.sendMessageToProxyWorker({
				type: "play",
				proxyData: {
					userWorkerUrl: {
						protocol: "http:",
						hostname: "127.0.0.1",
						port: String(port),
					},
					headers: {},
				},
			})
		).resolves.toBe(true);

		const inFlight = proxyWorker.dispatchFetch("http://example.com/in-flight");
		await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0));

		// A reload pauses the proxy, so the failed request is requeued rather
		// than reported, and then the next control request arrives empty.
		await expect(
			controller.sendMessageToProxyWorker({ type: "pause" })
		).resolves.toBe(true);
		const control = await proxyWorker.dispatchFetch(
			"http://dummy/cdn-cgi/ProxyWorker/play",
			{ headers: { Authorization: controller.secret } }
		);
		expect(control.status).toBe(400);

		for (const socket of sockets) {
			socket.destroy();
		}

		const response = await inFlight;
		expect(response.status).toBe(503);
		expect(await response.text()).toContain(
			"https://github.com/oven-sh/bun/issues/39247"
		);
	});
});
