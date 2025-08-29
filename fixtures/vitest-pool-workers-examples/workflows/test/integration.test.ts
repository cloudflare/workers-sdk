import {
	env,
	introspectWorkflow,
	introspectWorkflowInstance,
	SELF,
} from "cloudflare:test";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

describe("Test Workflow", () => {
	it("should be able to trigger a workflow", async () => {
		const res = await SELF.fetch("https://mock-worker.local");

		expect(res.status).toBe(200);
	});

	it("workflow should reach the end and be successful", async () => {
		const res = await SELF.fetch("https://mock-worker.local");

		const json = await res.json<{ id: string }>();

		await vi.waitUntil(async () => {
			const res = await SELF.fetch(`https://mock-worker.local?id=${json.id}`);

			const statusJson = await res.json<{ status: string }>();
			console.log(statusJson);
			return statusJson.status === "complete";
		}, 1000);
	});

	it("workflow should reach the end and be successful with introspector", async () => {
		const introspector = await introspectWorkflow(env.TEST_WORKFLOW);

		await SELF.fetch("https://mock-worker.local");

		const instances = introspector.get();
		assert(instances.length === 1);

		const instance = instances[0];
		await instance.waitForStatus("complete");
		await instance.cleanUp();
	});
});

describe("Test long Workflow", () => {
	const STEP_NAME = "my step";
	const mockResult = "mocked result";

	let introspector: Awaited<ReturnType<typeof introspectWorkflow>>;
	let instances: Awaited<ReturnType<typeof introspectWorkflowInstance>>[];

	beforeEach(async () => {
		// CONFIG:
		introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});
	});

	afterEach(async () => {
		// CLEANUP:
		// Instance introspectors should be clean to prevent persisted state across tests
		for (const instance of instances) {
			instance.cleanUp();
		}

		// Workflow introspector should be cleaned at the end of/after each test
		introspector.cleanUp();
	});

	it("workflow should be able to introspect and reach the end and be successful", async () => {
		await SELF.fetch("https://mock-worker.local/long-workflow");

		instances = introspector.get();
		assert(instances.length === 1);

		// ASSERTIONS:
		const instance = instances[0];
		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus("complete");
	});

	it("workflow batch should be able to introspect and reach the end and be successful", async () => {
		await SELF.fetch("https://mock-worker.local/long-workflow-batch");

		instances = introspector.get();
		assert(instances.length === 3);

		// ASSERTIONS:
		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus("complete");
		}
	});
});
