import { env, introspectWorkflowInstance } from "cloudflare:test";
import { expect, it } from "vitest";

const INSTANCE_ID = "12345678910";
const STATUS_COMPLETE = "complete";
const STATUS_ERROR = "errored";
const STEP_NAME = "AI content scan";

it("should mock a non-violation score and complete", async () => {
	const mockResult = { violationScore: 0 };

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
		await instance.waitForStepResult({ name: "auto approve content" })
	).toEqual({ status: "auto_approved" });

	await instance.waitForStatus(STATUS_COMPLETE);
});

it("should mock the violation score calculation to fail 2 times and then complete", async () => {
	const mockResult = { violationScore: 0 };

	await using instance = await introspectWorkflowInstance(
		env.MODERATOR,
		INSTANCE_ID
	);
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

	expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
		mockResult
	);
	expect(
		await instance.waitForStepResult({ name: "auto approve content" })
	).toEqual({ status: "auto_approved" });

	await instance.waitForStatus(STATUS_COMPLETE);
});

it("should mock a violation score and complete", async () => {
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

	await instance.waitForStatus(STATUS_COMPLETE);
});

it("should be reviewed, accepted and complete", async () => {
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

	await instance.waitForStatus(STATUS_COMPLETE);
});

it("should force human review to timeout and error", async () => {
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

	await instance.waitForStatus(STATUS_ERROR);
});
