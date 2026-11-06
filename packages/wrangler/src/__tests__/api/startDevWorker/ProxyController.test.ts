import { describe, test, vi } from "vitest";
import type { Miniflare } from "miniflare";
import { serialiseError } from "../../../api/startDevWorker/events";
import { ProxyController } from "../../../api/startDevWorker/ProxyController";
import type { EsbuildBundle } from "../../../dev/use-esbuild";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type {
	ProxyData,
	SerializedError,
} from "../../../api/startDevWorker/events";
import type { StartDevWorkerOptions } from "../../../api/startDevWorker/types";

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

	test("teardown waits for the in-flight 'play' message before disposing the ProxyWorker", async ({
		expect,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/16046:
		// createTestHarness's listen()/reset() resolve as soon as `reloadComplete`
		// fires, but the ProxyWorker `play` message is queued fire-and-forget on
		// `runtimeMessageMutex`, so a close() that follows immediately disposes
		// the ProxyWorker while the message is still in flight — which crashed
		// the process with an uncaught `setTypeOfService EINVAL` on macOS.
		const bus = new FakeBus();
		const controller = new ProxyController(bus);

		let settlePlay: (value: unknown) => void = () => {};
		const dispatchFetch = vi.fn(
			() =>
				new Promise<unknown>((resolve) => {
					settlePlay = resolve;
				})
		);
		const proxyWorker = {
			ready: Promise.resolve("ready"),
			dispatchFetch,
			dispose: vi.fn(() => Promise.resolve()),
		} as unknown as Miniflare;

		controller.emitReadyEvent(
			proxyWorker,
			new URL("http://localhost:8787/"),
			undefined
		);
		// In the real flow `onConfigUpdate` assigns the ProxyWorker instance,
		// which `teardown()` later disposes.
		controller.proxyWorker = proxyWorker;

		controller.onReloadComplete({
			type: "reloadComplete",
			config: { dev: {} } as StartDevWorkerOptions,
			bundle: {} as EsbuildBundle,
			proxyData: {} as ProxyData,
		});

		// The `play` message is now dispatched, held unresolved.
		await vi.waitFor(() => {
			expect(dispatchFetch).toHaveBeenCalledTimes(1);
		});
		expect(String(dispatchFetch.mock.calls[0]?.[0])).toContain(
			"/cdn-cgi/ProxyWorker/play"
		);

		const teardown = controller.teardown();

		// Give teardown every opportunity to dispose the ProxyWorker early; it
		// must hold off until the in-flight message has gone through.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(proxyWorker.dispose).not.toHaveBeenCalled();

		settlePlay(undefined);
		await teardown;
		expect(proxyWorker.dispose).toHaveBeenCalledTimes(1);
	});
});
