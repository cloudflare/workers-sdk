import { describe, test } from "vitest";
import { serialiseError } from "../../../api/startDevWorker/events";
import { ProxyController } from "../../../api/startDevWorker/ProxyController";
import { logger } from "../../../logger";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { SerializedError } from "../../../api/startDevWorker/events";

describe("ProxyController", () => {
	const std = mockConsoleMethods();

	test("request-scoped ProxyWorker errors are logged without stopping dev", ({
		expect,
	}) => {
		const bus = new FakeBus();
		const controller = new ProxyController(bus);

		controller.onProxyWorkerMessage({
			type: "error",
			error: {
				name: "Error",
				message: "Network connection lost.",
				stack: "Error: Network connection lost.",
			},
		});

		expect(bus.events).toEqual([]);
		expect(std.err).toContain(
			"Error proxying request to the local Worker: Network connection lost."
		);
	});

	test("request-scoped ProxyWorker errors keep stack and cause at debug level", ({
		expect,
		onTestFinished,
	}) => {
		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		logger.loggerLevel = "debug";
		onTestFinished(() => logger.resetLoggerLevel());

		controller.onProxyWorkerMessage({
			type: "error",
			error: {
				name: "Error",
				message: "Network connection lost.",
				stack:
					"Error: Network connection lost.\n    at fetch (ProxyWorker.ts:167:9)",
				cause: { name: "TypeError", message: "socket hang up" },
			},
		});

		expect(bus.events).toEqual([]);
		expect(std.debug).toContain("ProxyWorker request error details:");
		expect(std.debug).toContain("at fetch (ProxyWorker.ts:167:9)");
		expect(std.debug).toContain("socket hang up");
	});

	test("request-scoped ProxyWorker errors are not logged after teardown", ({
		expect,
	}) => {
		const bus = new FakeBus();
		const controller = new ProxyController(bus);
		controller._torndown = true;

		controller.onProxyWorkerMessage({
			type: "error",
			error: {
				name: "Error",
				message: "Network connection lost.",
				stack: "Error: Network connection lost.",
			},
		});

		expect(bus.events).toEqual([]);
		expect(std.err).toBe("");
	});

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
});
