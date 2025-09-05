import {
	env,
	introspectWorkflow,
	introspectWorkflowInstance,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

const INSTANCE_ID = "12345678910";
const STEP_NAME = "my step";
const STATUS_COMPLETE = "complete";
const STATUS_ERRORED = "errored";

describe("Long Workflow (single instance)", () => {
	it("should disable all sleeps and complete instantly", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	}, 1000); // running under a second confirms that sleeps were disabled

	it("should disable a set of sleeps and complete", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			// disabling all sleeps either way to make test run fast
			await m.disableSleeps([
				{ name: "sleep for a while", index: 1 },
				{ name: "sleep for a while", index: 2 },
				{ name: "sleep for a day" },
			]);
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	});

	it("should be able to mock step result and complete", async () => {
		const mockResult = "a mocked result!";

		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	});

	it("should not be able to mock the same step result more than one time", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, "first mocked result");
			await expect(
				m.mockStepResult({ name: STEP_NAME }, "second mocked result")
			).rejects.toMatchInlineSnapshot(
				`[Error: [WorkflowIntrospector] Trying to mock step 'my step' multiple times!]`
			);
		});
	});

	it("should be able to mock step error in every retry and error", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"));
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		await expect(
			instance.waitForStepResult({ name: STEP_NAME })
		).rejects.toThrow();
		await instance.waitForStatus(STATUS_ERRORED);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_ERRORED);
	}, 1000);

	it("should be able to mock step error in the first 2 retries, then mock step result and complete", async () => {
		const mockResult = { result: "mocked" };

		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 2);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock step timeout in every retry and error", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME });
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		await expect(
			instance.waitForStepResult({ name: STEP_NAME })
		).rejects.toThrow();
		await instance.waitForStatus(STATUS_ERRORED);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_ERRORED);
	}, 1000);

	it("should be able to mock step timeout in first retry, then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };

		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock step timeout in first retry, mock error in the second retry and then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };

		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock an event and complete", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockEvent({ type: "event", payload: { data: "mocked" } });
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
			params: "run event",
		});

		await instance.waitForStatus(STATUS_COMPLETE);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_COMPLETE);
	}, 1000);

	it("should be able to force an event to time out and error", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
			params: "run event",
		});

		await instance.waitForStatus(STATUS_ERRORED);
		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_ERRORED);
	}, 1000);

	it("should not be able to force an event to time out and complete", async () => {
		await using instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		const createdInstance = await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
			params: "run event",
		});

		await expect(
			instance.waitForStatus(STATUS_COMPLETE)
		).rejects.toMatchInlineSnapshot(
			`[Error: [WorkflowIntrospector] The Wokflow instance 12345678910 has reached status 'errored'. This is a finite status that prevents it from ever reaching the expected status of 'complete'.]`
		);

		const instanceStatus = await createdInstance.status();
		expect(instanceStatus.status).toBe(STATUS_ERRORED);
	});
});

async function expectAllStatuses(
	handles: Array<{ status: () => Promise<{ status: string }> }>,
	expected: string
) {
	const statuses = await Promise.all(handles.map((h) => h.status()));
	expect(statuses.every((s) => s.status === expected)).toBe(true);
}

describe("Long Workflow (batch)", () => {
	it("should disable all sleeps and complete instantly", async () => {
		// Workflow introspector should be cleaned at the end of/after each test
		// `using` keyword allows disposal that calls cleanUp()
		// introspector cleanUp() also cleans instance introspectors to avoid persisted state across tests
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		await Promise.all(
			instances.map((instance) => instance.waitForStatus(STATUS_COMPLETE))
		);
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	}, 1000); // running under a second confirms that sleeps were disabled

	it("should disable a set of sleeps and complete", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			// disabling all sleeps either way to make test run fast
			await m.disableSleeps([
				{ name: "sleep for a while", index: 1 },
				{ name: "sleep for a while", index: 2 },
				{ name: "sleep for a day" },
			]);
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		await Promise.all(
			instances.map((instance) => instance.waitForStatus(STATUS_COMPLETE))
		);
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	});

	it("should be able to mock step result and complete", async () => {
		const mockResult = "a mocked result!";

		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus(STATUS_COMPLETE);
		}
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	});

	it("should not be able to mock the same step result more than one time", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, "first mocked result");
			await expect(
				m.mockStepResult({ name: STEP_NAME }, "second mocked result")
			).rejects.toMatchInlineSnapshot(
				`[Error: [WorkflowIntrospector] Trying to mock step 'my step' multiple times!]`
			);
		});
	});

	it("should be able to mock step error in every retry and error", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"));
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			await expect(
				instance.waitForStepResult({ name: STEP_NAME })
			).rejects.toThrow();
			await instance.waitForStatus(STATUS_ERRORED);
		}
		expectAllStatuses(createdInstances, STATUS_ERRORED);
	}, 1000);

	it("should be able to mock step error in the first 2 retries, then mock step result and complete", async () => {
		const mockResult = { result: "mocked" };

		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 2);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus(STATUS_COMPLETE);
		}
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock step timeout in every retry and error", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME });
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			await expect(
				instance.waitForStepResult({ name: STEP_NAME })
			).rejects.toThrow();
			await instance.waitForStatus(STATUS_ERRORED);
		}
		expectAllStatuses(createdInstances, STATUS_ERRORED);
	}, 1000);

	it("should be able to mock step timeout in first retry, then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };

		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus(STATUS_COMPLETE);
		}
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock step timeout in first retry, mock error in the second retry and then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };

		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus(STATUS_COMPLETE);
		}
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	}, 1000);

	it("should be able to mock an event and complete", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockEvent({ type: "event", payload: { data: "mocked" } });
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{ params: "run event" },
			{ params: "run event" },
			{
				id: INSTANCE_ID,
				params: "run event",
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		await Promise.all(
			instances.map((instance) => instance.waitForStatus(STATUS_COMPLETE))
		);
		expectAllStatuses(createdInstances, STATUS_COMPLETE);
	}, 1000); // running under a second confirms that the event was moked (and sleeps were disabled)

	it("should be able to force an event to time out and error", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{ params: "run event" },
			{ params: "run event" },
			{
				id: INSTANCE_ID,
				params: "run event",
			},
		]);
		expect(createdInstances.length).toBe(3);

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		await Promise.all(
			instances.map((instance) => instance.waitForStatus(STATUS_ERRORED))
		);
		expectAllStatuses(createdInstances, STATUS_ERRORED);
	}, 1000); // running under a second confirms that the event was forced to time out (and sleeps were disabled)

	it("should not be able to force an event to time out and complete", async () => {
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{
				id: INSTANCE_ID,
				params: "run event",
			},
		]);
		expect(createdInstances.length).toBe(1);

		const instances = introspector.get();
		expect(instances.length).toBe(1);

		await expect(
			instances[0].waitForStatus(STATUS_COMPLETE)
		).rejects.toMatchInlineSnapshot(
			`[Error: [WorkflowIntrospector] The Wokflow instance 12345678910 has reached status 'errored'. This is a finite status that prevents it from ever reaching the expected status of 'complete'.]`
		);

		expect((await createdInstances[0].status()).status).toBe(STATUS_ERRORED);
	});
});
