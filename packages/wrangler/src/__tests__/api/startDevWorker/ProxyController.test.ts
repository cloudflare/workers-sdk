import { describe, test } from "vitest";
import { ProxyController } from "../../../api/startDevWorker/ProxyController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";

describe("ProxyController", () => {
	mockConsoleMethods();

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
