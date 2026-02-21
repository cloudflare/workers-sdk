import { describe, expect, it } from "vitest";
import { runWorkflow } from "./utils";

describe("Context", () => {
	it("should provide attempt count 1 on first successful attempt", async () => {
		let receivedAttempt: number | undefined;

		await runWorkflow("MOCK-INSTANCE-ID", async (_event, step) => {
			// TODO: remove after types are updated
			// @ts-expect-error WorkflowStep types
			const result = await step.do("a successful step", async (ctx) => {
				receivedAttempt = ctx.attempt;
				return "success";
			});
			return result;
		});

		expect(receivedAttempt).toBe(1);
	});

	it("should provide attempt count to callback", async () => {
		const receivedAttempts: number[] = [];

		await runWorkflow("MOCK-INSTANCE-ID", async (_event, step) => {
			const result = await step.do(
				"retrying step",
				{
					retries: {
						limit: 2,
						delay: 0,
					},
				},
				// TODO: remove after types are updated
				// @ts-expect-error WorkflowStep types
				async (ctx) => {
					receivedAttempts.push(ctx.attempt);
					throw new Error(`Throwing`);
				}
			);
			return result;
		});

		// Should have received attempts 1, 2, and 3
		expect(receivedAttempts).toEqual([1, 2, 3]);
	});
});
