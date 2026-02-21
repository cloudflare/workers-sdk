import {
	createExecutionContext,
	env,
	runInDurableObject,
} from "cloudflare:test";
import { describe, it, vi } from "vitest";
import { WorkflowBinding } from "../src/binding";
import { setWorkflowEntrypoint } from "./utils";

describe("WorkflowBinding", () => {
	it("should not call dispose when sending an event to an instance", async ({
		expect,
	}) => {
		const instanceId = "test-instance-with-event";
		const ctx = createExecutionContext();

		const binding = new WorkflowBinding(ctx, {
			ENGINE: env.ENGINE,
			BINDING_NAME: "TEST_WORKFLOW",
		});

		// Set up a workflow that waits for an event
		const engineId = env.ENGINE.idFromName(instanceId);
		const engineStub = env.ENGINE.get(engineId);

		await setWorkflowEntrypoint(engineStub, async (event, step) => {
			const receivedEvent = await step.waitForEvent("wait-for-test-event", {
				type: "test-event",
				timeout: "10 seconds",
			});
			return receivedEvent;
		});

		const { id } = await binding.create({ id: instanceId });
		expect(id).toBe(instanceId);

		const instance = await binding.get(instanceId);
		expect(instance.id).toBe(instanceId);

		const disposeSpy = vi.fn();

		await runInDurableObject(engineStub, (engine) => {
			const originalReceiveEvent = engine.receiveEvent.bind(engine);
			engine.receiveEvent = (event) => {
				const result = originalReceiveEvent(event);
				return Object.assign(result, {
					[Symbol.dispose]: disposeSpy,
				});
			};
		});

		using _ = (await instance.sendEvent({
			type: "test-event",
			payload: { test: "data" },
		})) as unknown as Disposable;

		// Wait a bit to ensure event processing
		await vi.waitFor(
			async () => {
				const status = await instance.status();
				expect(status.status).toBe("complete");
			},
			{ timeout: 1000 }
		);

		expect(disposeSpy).not.toHaveBeenCalled();
	});
});
