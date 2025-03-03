import {
	createExecutionContext,
	env,
	runInDurableObject,
} from "cloudflare:test";
import { NonRetryableError } from "cloudflare:workflows";
import { describe, expect, it } from "vitest";
import { InstanceEvent } from "../src";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	Engine,
	EngineLogs,
} from "../src/engine";
import type { ProvidedEnv } from "cloudflare:test";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

async function setWorkflowEntrypoint(
	stub: DurableObjectStub<Engine>,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
) {
	const ctx = createExecutionContext();
	await runInDurableObject(stub, (instance) => {
		// @ts-expect-error this is only a stub for WorkflowEntrypoint
		instance.env.USER_WORKFLOW = new (class {
			constructor(
				// eslint-disable-next-line @typescript-eslint/no-shadow
				protected ctx: ExecutionContext,
				// eslint-disable-next-line @typescript-eslint/no-shadow
				protected env: ProvidedEnv
			) {}
			public async run(
				event: Readonly<WorkflowEvent<unknown>>,
				step: WorkflowStep
			): Promise<unknown> {
				return await callback(event, step);
			}
		})(ctx, env);
	});
}

async function runWorkflow(
	instanceId: string,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
): Promise<DurableObjectStub<Engine>> {
	const engineId = env.ENGINE.idFromName(instanceId);
	const engineStub = env.ENGINE.get(engineId);

	await setWorkflowEntrypoint(engineStub, callback);

	await engineStub.init(
		12346,
		{} as DatabaseWorkflow,
		{} as DatabaseVersion,
		{} as DatabaseInstance,
		{ payload: {}, timestamp: new Date(), instanceId: "some-instance-id" }
	);

	return engineStub;
}

describe("Engine", () => {
	it("should not retry after NonRetryableError is thrown", async () => {
		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID",
			async (event, step) => {
				await step.do("should only have one retry", async () => {
					throw new NonRetryableError("Should only retry once");
				});
			}
		);

		const logs = (await engineStub.readLogs()) as EngineLogs;

		expect(
			logs.logs.some((val) => val.event == InstanceEvent.WORKFLOW_FAILURE)
		).toBe(true);
		expect(
			logs.logs.filter((val) => val.event == InstanceEvent.ATTEMPT_START)
		).toHaveLength(1);
	});

	it("should not error out if step fails but is try-catched", async () => {
		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID",
			async (event, step) => {
				try {
					await step.do(
						"always errors out",
						{
							retries: {
								limit: 0,
								delay: 1000,
							},
						},
						async () => {
							throw new Error("Step errors out");
						}
					);
				} catch (_e) {}
				return "finished";
			}
		);

		const logs = (await engineStub.readLogs()) as EngineLogs;

		expect(
			logs.logs.some((val) => val.event == InstanceEvent.WORKFLOW_SUCCESS)
		).toBe(true);

		expect(
			logs.logs.filter((val) => val.event == InstanceEvent.ATTEMPT_FAILURE)
		).toHaveLength(1);
	});
});
