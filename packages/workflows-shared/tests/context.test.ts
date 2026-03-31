import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import { InstanceEvent } from "../src";
import { MODIFIER_KEYS } from "../src/modifier";
import { runWorkflow, runWorkflowAndAwait } from "./utils";
import type { EngineLogs } from "../src/engine";

afterEach(async () => {
	await workerdUnsafe.abortAllDurableObjects();
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

	it("should wait for retry delays by default", async ({ expect }) => {
		const start = Date.now();
		const engineStub = await runWorkflowAndAwait(
			"MOCK-INSTANCE-RETRY-DELAYS",
			async (_event, step) => {
				const result = await step.do(
					"retrying step with delay",
					{
						retries: {
							limit: 1,
							delay: "1 second",
							backoff: "constant",
						},
					},
					async () => {
						throw new Error("Always fails");
					}
				);
				return result;
			}
		);
		const elapsed = Date.now() - start;

		const logs = (await engineStub.readLogs()) as EngineLogs;
		expect(
			logs.logs.filter((val) => val.event === InstanceEvent.ATTEMPT_START)
		).toHaveLength(2);
		// Should have waited at least ~1 second for the retry delay
		expect(elapsed).toBeGreaterThanOrEqual(900);
	});

	it("should skip retry delays when disableRetryDelays is set", async ({
		expect,
	}) => {
		const engineId = env.ENGINE.idFromName("MOCK-INSTANCE-DISABLE-RETRY");
		const engineStub = env.ENGINE.get(engineId);

		// Set the disableRetryDelays flag before running the workflow
		await runInDurableObject(engineStub, async (_engine, state) => {
			await state.storage.put(MODIFIER_KEYS.DISABLE_ALL_RETRY_DELAYS, true);
		});

		const start = Date.now();
		const stub = await runWorkflowAndAwait(
			"MOCK-INSTANCE-DISABLE-RETRY",
			async (_event, step) => {
				const result = await step.do(
					"retrying step with delay",
					{
						retries: {
							limit: 2,
							delay: "10 seconds",
							backoff: "constant",
						},
					},
					async () => {
						throw new Error("Always fails");
					}
				);
				return result;
			}
		);
		const elapsed = Date.now() - start;

		const logs = (await stub.readLogs()) as EngineLogs;
		expect(
			logs.logs.filter((val) => val.event === InstanceEvent.ATTEMPT_START)
		).toHaveLength(3);
		// Without disableRetryDelays, this would take 20+ seconds (10s + 10s)
		expect(elapsed).toBeLessThan(5000);
	});
});
