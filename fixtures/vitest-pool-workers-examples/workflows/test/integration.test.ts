import { env, introspectWorkflow, SELF } from "cloudflare:test";
import { it } from "vitest";

const STATUS_COMPLETE = "complete";
const STEP_NAME = "AI content scan";
const mockResult = { violationScore: 0 };

// This example implicitly disposes the Workflow instance
it("workflow should be able to reach the end and be successful", async ({
	expect,
}) => {
	// CONFIG with `await using` to ensure Workflow instances cleanup:
	await using introspector = await introspectWorkflow(env.MODERATOR);
	await introspector.modifyAll(async (m) => {
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
	await expect(instance.waitForStatus(STATUS_COMPLETE)).resolves.not.toThrow();

	const output = await instance.getOutput();
	expect(output).toEqual({ status: "auto_approved" });

	// DISPOSE: ensured by `await using`
});

// This example explicitly disposes the Workflow instances
it("workflow batch should be able to reach the end and be successful", async ({
	expect,
}) => {
	// CONFIG:
	let introspector = await introspectWorkflow(env.MODERATOR);
	try {
		await introspector.modifyAll(async (m) => {
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
			await expect(
				instance.waitForStatus(STATUS_COMPLETE)
			).resolves.not.toThrow();

			const output = await instance.getOutput();
			expect(output).toEqual({ status: "auto_approved" });
		}
	} finally {
		// DISPOSE:
		// Workflow introspector should be disposed the end of each test, if no `await using` dyntax is used
		// Also disposes all intercepted instances
		await introspector.dispose();
	}
});
