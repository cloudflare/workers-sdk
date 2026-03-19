import { afterEach, describe, it, vi } from "vitest";
import { InstanceEvent } from "../src";
import { runWorkflow, settlePendingWorkflows } from "./utils";
import type { EngineLogs } from "../src/engine";

afterEach(async () => {
	await settlePendingWorkflows();
});

describe("Context", () => {
	it("should provide attempt count 1 on first successful attempt", async ({
		expect,
	}) => {
		let receivedAttempt: number | undefined;

		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID",
			async (_event, step) => {
				const result = await step.do("a successful step", async (ctx) => {
					receivedAttempt = ctx.attempt;
					return "success";
				});
				return result;
			}
		);

		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return logs.logs.some(
					(val) => val.event === InstanceEvent.WORKFLOW_SUCCESS
				);
			},
			{ timeout: 1000 }
		);

		expect(receivedAttempt).toBe(1);
	});

	it("should provide attempt count to callback", async ({ expect }) => {
		const receivedAttempts: number[] = [];

		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID-RETRY",
			async (_event, step) => {
				const result = await step.do(
					"retrying step",
					{
						retries: {
							limit: 2,
							delay: 0,
						},
					},
					async (ctx) => {
						receivedAttempts.push(ctx.attempt);
						throw new Error(`Throwing`);
					}
				);
				return result;
			}
		);

		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return logs.logs.some(
					(val) => val.event === InstanceEvent.WORKFLOW_FAILURE
				);
			},
			{ timeout: 1000 }
		);

		// Should have received attempts 1, 2, and 3
		expect(receivedAttempts).toEqual([1, 2, 3]);
	});
});
