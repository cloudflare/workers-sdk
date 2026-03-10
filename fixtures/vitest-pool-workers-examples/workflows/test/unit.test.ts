import { env, introspectWorkflowInstance } from "cloudflare:test";
import { it } from "vitest";

const INSTANCE_ID = "12345678910";
const STATUS_COMPLETE = "complete";
const STATUS_ERROR = "errored";
const STEP_NAME = "AI content scan";

// This example implicitly disposes the Workflow instance
it("should mock a non-violation score and complete", async ({ expect }) => {
	const mockResult = { violationScore: 0 };

	// CONFIG with `await using` to ensure Workflow instances cleanup:
	await using instance = await introspectWorkflowInstance(
		env.MODERATOR,
		INSTANCE_ID
	);
	await instance.modify(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
	});

	await env.MODERATOR.create({
		id: INSTANCE_ID,
	});

	// ASSERTIONS:
	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);
	expect(
		await instance.waitForStepResult({ name: "auto approve content" })
	).toEqual({ status: "auto_approved" });

	await expect(instance.waitForStatus(STATUS_COMPLETE)).resolves.not.toThrow();

	const output = await instance.getOutput();
	expect(output).toEqual({ status: "auto_approved" });

	// DISPOSE: ensured by `await using`
});

// This example explicitly disposes the Workflow instance
it("should mock the violation score calculation to fail 2 times and then complete", async ({
	expect,
}) => {
	const mockResult = { violationScore: 0 };

	// CONFIG:
	const instance = await introspectWorkflowInstance(env.MODERATOR, INSTANCE_ID);

	try {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepError(
				{ name: STEP_NAME },
				new Error("Something went wrong!"),
				2
			);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await env.MODERATOR.create({
			id: INSTANCE_ID,
		});

		// ASSERTIONS:
		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		expect(
			await instance.waitForStepResult({ name: "auto approve content" })
		).toEqual({ status: "auto_approved" });

		await expect(
			instance.waitForStatus(STATUS_COMPLETE)
		).resolves.not.toThrow();

		const output = await instance.getOutput();
		expect(output).toEqual({ status: "auto_approved" });
	} finally {
		// DISPOSE:
		// Workflow introspector should be disposed the end of each test, if no `await using` dyntax is used
		// Also disposes all intercepted instances
		await instance.dispose();
	}
});

it("should mock a violation score and complete", async ({ expect }) => {
	const mockResult = { violationScore: 99 };

	await using instance = await introspectWorkflowInstance(
		env.MODERATOR,
		INSTANCE_ID
	);
	await instance.modify(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
	});

	await env.MODERATOR.create({
		id: INSTANCE_ID,
	});

	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);
	expect(
		await instance.waitForStepResult({ name: "auto reject content" })
	).toEqual({ status: "auto_rejected" });

	await expect(instance.waitForStatus(STATUS_COMPLETE)).resolves.not.toThrow();

	const output = await instance.getOutput();
	expect(output).toEqual({ status: "auto_rejected" });
});

it("should be reviewed, accepted and complete", async ({ expect }) => {
	const mockResult = { violationScore: 50 };

	await using instance = await introspectWorkflowInstance(
		env.MODERATOR,
		INSTANCE_ID
	);
	await instance.modify(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
		await m.mockEvent({
			type: "moderation-decision",
			payload: { moderatorAction: "approve" },
		});
	});

	await env.MODERATOR.create({
		id: INSTANCE_ID,
	});

	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);
	expect(
		await instance.waitForStepResult({ name: "apply moderator decision" })
	).toEqual({ status: "moderated", decision: "approve" });

	await expect(instance.waitForStatus(STATUS_COMPLETE)).resolves.not.toThrow();

	const output = await instance.getOutput();
	expect(output).toEqual({ decision: "approve", status: "moderated" });
});

it("should force human review to timeout and error", async ({ expect }) => {
	const mockResult = { violationScore: 50 };

	await using instance = await introspectWorkflowInstance(
		env.MODERATOR,
		INSTANCE_ID
	);
	await instance.modify(async (m) => {
		await m.disableSleeps();
		await m.mockStepResult({ name: STEP_NAME }, mockResult);
		await m.forceEventTimeout({ name: "human review" });
	});

	await env.MODERATOR.create({
		id: INSTANCE_ID,
	});

	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);

	await expect(instance.waitForStatus(STATUS_ERROR)).resolves.not.toThrow();

	const error = await instance.getError();
	expect(error.name).toEqual("Error");
	expect(error.message).toContain("Execution timed out");
});
