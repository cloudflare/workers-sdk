import { env, introspectWorkflow, SELF } from "cloudflare:test";
import { expect, it } from "vitest";

const STATUS_COMPLETE = "complete";
const STEP_NAME = "AI content scan";
const mockResult = { violationScore: 0 };

it("workflow should be able to reach the end and be successful", async () => {
	// This example shows how to implicitly cleanUp Workflow instances

	// CONFIG with `using` to ensure Workflow instances cleanup:
	await using introspector = await introspectWorkflow(env.MODERATOR);
	introspector.modifyAll(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
	});

	await SELF.fetch(`https://mock-worker.local/moderate`);

	const instances = introspector.get();
	expect(instances.length).toBe(1);

	// ASSERTIONS:
	const instance = instances[0];
	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);
	await instance.waitForStatus(STATUS_COMPLETE);

	// CLEANUP: ensured by `using`
});

it("workflow batch should be able to reach the end and be successful", async () => {
	// This example shows how to explicitly cleanUp Workflow instances

	// CONFIG:
	let introspector = await introspectWorkflow(env.MODERATOR);
	introspector.modifyAll(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
	});

	await SELF.fetch(`https://mock-worker.local/moderate-batch`);

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
