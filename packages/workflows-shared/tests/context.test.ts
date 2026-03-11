import { env, runInDurableObject } from "cloudflare:test";
import { describe, it } from "vitest";
import { runWorkflow, setWorkflowEntrypoint } from "./utils";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
} from "../src/engine";

describe("Context", () => {
	it("should provide attempt count 1 on first successful attempt", async ({
		expect,
	}) => {
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

	it("should provide attempt count to callback", async ({ expect }) => {
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

	it("should wait for retry delays by default", async ({ expect }) => {
		const receivedAttempts: number[] = [];
		const engineId = env.ENGINE.idFromName("MOCK-INSTANCE-RETRY-DELAYS");
		const engineStub = env.ENGINE.get(engineId);

		await setWorkflowEntrypoint(engineStub, async (_event, step) => {
			const result = await step.do(
				"retrying step with delay",
				{
					retries: {
						limit: 1,
						delay: "1 second",
						backoff: "constant",
					},
				},
				// TODO: remove after types are updated
				// @ts-expect-error WorkflowStep types
				async (ctx) => {
					receivedAttempts.push(ctx.attempt);
					throw new Error("Always fails");
				}
			);
			return result;
		});

		const start = Date.now();
		await engineStub.init(
			12346,
			{} as DatabaseWorkflow,
			{} as DatabaseVersion,
			{} as DatabaseInstance,
			{ payload: {}, timestamp: new Date(), instanceId: "some-instance-id" }
		);
		const elapsed = Date.now() - start;

		// Both attempts (1 initial + 1 retry) should have run
		expect(receivedAttempts).toEqual([1, 2]);
		// Should have waited at least ~1 second for the retry delay
		expect(elapsed).toBeGreaterThanOrEqual(900);
	});

	it("should skip retry delays when disableRetryDelays is set", async ({
		expect,
	}) => {
		const receivedAttempts: number[] = [];
		const engineId = env.ENGINE.idFromName("MOCK-INSTANCE-DISABLE-RETRY");
		const engineStub = env.ENGINE.get(engineId);

		await setWorkflowEntrypoint(engineStub, async (_event, step) => {
			const result = await step.do(
				"retrying step with delay",
				{
					retries: {
						limit: 2,
						delay: "10 seconds",
						backoff: "constant",
					},
				},
				// TODO: remove after types are updated
				// @ts-expect-error WorkflowStep types
				async (ctx) => {
					receivedAttempts.push(ctx.attempt);
					throw new Error("Always fails");
				}
			);
			return result;
		});

		// Set the disableRetryDelays flag before running the workflow
		await runInDurableObject(engineStub, async (instance) => {
			await instance.ctx.storage.put("disableRetryDelays", true);
		});

		const start = Date.now();
		await engineStub.init(
			12346,
			{} as DatabaseWorkflow,
			{} as DatabaseVersion,
			{} as DatabaseInstance,
			{ payload: {}, timestamp: new Date(), instanceId: "some-instance-id" }
		);
		const elapsed = Date.now() - start;

		// All 3 attempts (1 initial + 2 retries) should have run
		expect(receivedAttempts).toEqual([1, 2, 3]);
		// Without disableRetryDelays, this would take 20+ seconds (10s + 10s)
		expect(elapsed).toBeLessThan(5000);
	});
});
