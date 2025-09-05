import { beforeEach } from "node:test";
import { env, introspectWorkflow, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";

const STATUS_COMPLETE = "complete";

describe("Test Workflow", () => {
	it("should be able to trigger a workflow", async () => {
		// With `using` to ensure cleanup:
		await using introspector = await introspectWorkflow(env.TEST_WORKFLOW);
		const res = await SELF.fetch("https://mock-worker.local");

		expect(res.status).toBe(200);
	});

	it("workflow should reach the end and be successful", async () => {
		// With `using` to ensure cleanup:
		await using introspector = await introspectWorkflow(env.TEST_WORKFLOW);
		const res = await SELF.fetch("https://mock-worker.local");

		const json = await res.json<{ id: string }>();

		await vi.waitUntil(async () => {
			const res = await SELF.fetch(`https://mock-worker.local?id=${json.id}`);

			const statusJson = await res.json<{ status: string }>();
			expect(statusJson.status).toBe(STATUS_COMPLETE);
			return true;
		}, 1000);
	});

	it("workflow should reach the end and be successful with introspector", async () => {
		// CONFIG with `using` to ensure cleanup:
		await using introspector = await introspectWorkflow(env.TEST_WORKFLOW);

		await SELF.fetch("https://mock-worker.local");

		const instances = introspector.get();
		expect(instances.length).toBe(1);

		// ASSERTIONS:
		const instance = instances[0];
		await instance.waitForStatus(STATUS_COMPLETE);

		// CLEANUP: assured by Symbol.asyncDispose
	});
});

describe("Test long Workflow", () => {
	const STEP_NAME = "my step";
	const mockResult = "mocked result";

	it("workflow should be able to introspect and reach the end and be successful", async () => {
		// CONFIG with `using` to ensure cleanup:
		await using introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await SELF.fetch("https://mock-worker.local/long-workflow");

		const instances = introspector.get();
		expect(instances.length).toBe(1);

		// ASSERTIONS:
		const instance = instances[0];
		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus(STATUS_COMPLETE);

		// CLEANUP: done by Symbol.asyncDispose
	});

	it("workflow batch should be able to introspect and reach the end and be successful (explicit cleanup)", async () => {
		// CONFIG:
		let introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await SELF.fetch("https://mock-worker.local/long-workflow-batch");

		const instances = introspector.get();
		expect(instances.length).toBe(3);

		// ASSERTIONS:
		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus(STATUS_COMPLETE);
		}

		// CLEANUP:
		// Workflow introspector should be cleaned at the end of/after each test, if no `using` keyword is used for the introspector
		// Cleans up all intercepted instances
		await introspector.cleanUp();
	});
});
