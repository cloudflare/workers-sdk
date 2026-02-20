import {
	createExecutionContext,
	env,
	runInDurableObject,
} from "cloudflare:test";
import { NonRetryableError } from "cloudflare:workflows";
import { describe, it, vi } from "vitest";
import { DEFAULT_STEP_LIMIT, InstanceEvent, InstanceStatus } from "../src";
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

async function runWorkflowDefer(
	instanceId: string,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
): Promise<DurableObjectStub<Engine>> {
	const engineId = env.ENGINE.idFromName(instanceId);
	const engineStub = env.ENGINE.get(engineId);

	await setWorkflowEntrypoint(engineStub, callback);

	void engineStub.init(
		12346,
		{} as DatabaseWorkflow,
		{} as DatabaseVersion,
		{} as DatabaseInstance,
		{ payload: {}, timestamp: new Date(), instanceId: "some-instance-id" }
	);

	return engineStub;
}

describe("Engine", () => {
	it("should not retry after NonRetryableError is thrown", async ({
		expect,
	}) => {
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

	it("should not error out if step fails but is try-catched", async ({
		expect,
	}) => {
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
				} catch {}
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

	it("waitForEvent should receive events while active", async () => {
		const engineStub = await runWorkflowDefer(
			"MOCK-INSTANCE-ID",
			async (_, step) => {
				return await step.waitForEvent("i'm a event!", {
					type: "event-type-1",
					timeout: "10 seconds",
				});
			}
		);

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter((val) => val.event == InstanceEvent.WAIT_START);
		}, 500);

		await engineStub.receiveEvent({
			type: "event-type-1",
			timestamp: new Date(),
			payload: {},
		});

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter(
				(val) => val.event == InstanceEvent.WORKFLOW_SUCCESS
			);
		}, 500);
	});

	it("waitForEvent should receive events even if not active", async () => {
		const engineStub = await runWorkflowDefer(
			"MOCK-INSTANCE-ID",
			async (_, step) => {
				return await step.waitForEvent("i'm a event!", {
					type: "event-type-1",
					timeout: "10 seconds",
				});
			}
		);

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter((val) => val.event == InstanceEvent.WAIT_START);
		}, 500);

		try {
			await runInDurableObject(engineStub, async (_, state) => {
				state.abort("kabooom");
			});
		} catch {
			// supposed to error out
		}

		// Get a new stub since we've just aborted the durable object
		const newStub = env.ENGINE.get(env.ENGINE.idFromName("MOCK-INSTANCE-ID"));

		await newStub.receiveEvent({
			type: "event-type-1",
			timestamp: new Date(),
			payload: {},
		});

		await vi.waitUntil(async () => {
			const logs = (await newStub.readLogs()) as EngineLogs;
			return logs.logs.filter(
				(val) => val.event == InstanceEvent.WORKFLOW_SUCCESS
			);
		}, 500);
	});

	it("should restore state from storage when accountId is undefined", async ({
		expect,
	}) => {
		const instanceId = "RESTORE-TEST-INSTANCE";
		const accountId = 12345;
		const workflow: DatabaseWorkflow = {
			name: "test-workflow",
			id: "workflow-123",
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			script_name: "test-script",
			class_name: "TestWorkflow",
			triggered_on: null,
		};
		const version: DatabaseVersion = {
			id: "version-123",
			class_name: "TestWorkflow",
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			workflow_id: workflow.id,
			mutable_pipeline_id: "pipeline-123",
		};
		const instance: DatabaseInstance = {
			id: instanceId,
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			workflow_id: workflow.id,
			version_id: version.id,
			status: InstanceStatus.Running,
			started_on: new Date().toISOString(),
			ended_on: null,
		};
		const event = {
			payload: {},
			timestamp: new Date(),
			instanceId: instanceId,
		};

		const engineStub = await runWorkflow(instanceId, async () => {
			return "test";
		});

		await runInDurableObject(engineStub, async (engine) => {
			await engine.init(accountId, workflow, version, instance, event);
			await engine.setStatus(accountId, instanceId, InstanceStatus.Running);
			await engine.abort("kaboom");
		});

		const engineId = env.ENGINE.idFromName(instanceId);
		const restartedStub = env.ENGINE.get(engineId);

		const status = await runInDurableObject(restartedStub, (engine) => {
			return engine.getStatus();
		});

		expect(status).toBe(InstanceStatus.Running);

		const logs = (await restartedStub.readLogs()) as EngineLogs;
		expect(
			logs.logs.some((log) => log.event === InstanceEvent.WORKFLOW_START)
		).toBe(true);
	});

	describe("step limits", () => {
		it("should enforce step limit when exceeded", async ({ expect }) => {
			const stepLimit = 3;

			const engineStub = await runWorkflow(
				"STEP-LIMIT-EXCEEDED",
				async (_event, step) => {
					// Try to run more steps than the limit
					for (let i = 0; i < stepLimit + 1; i++) {
						await step.do(`step-${i}`, async () => `result-${i}`);
					}
				}
			);

			// Set the step limit on the engine
			await runInDurableObject(engineStub, (engine) => {
				engine.stepLimit = stepLimit;
			});

			// Re-init to run with the new limit
			await setWorkflowEntrypoint(engineStub, async (_event, step) => {
				for (let i = 0; i < stepLimit + 1; i++) {
					await step.do(`step-${i}`, async () => `result-${i}`);
				}
			});

			const engineId = env.ENGINE.idFromName("STEP-LIMIT-EXCEEDED-2");
			const freshStub = env.ENGINE.get(engineId);

			await runInDurableObject(freshStub, (engine) => {
				engine.stepLimit = stepLimit;
			});

			await setWorkflowEntrypoint(freshStub, async (_event, step) => {
				for (let i = 0; i < stepLimit + 1; i++) {
					await step.do(`step-${i}`, async () => `result-${i}`);
				}
			});

			await freshStub.init(
				12346,
				{} as DatabaseWorkflow,
				{} as DatabaseVersion,
				{ id: "STEP-LIMIT-EXCEEDED-2" } as DatabaseInstance,
				{
					payload: {},
					timestamp: new Date(),
					instanceId: "STEP-LIMIT-EXCEEDED-2",
				}
			);

			const logs = (await freshStub.readLogs()) as EngineLogs;

			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_FAILURE)
			).toBe(true);
		});

		it("should succeed when steps are exactly at the limit", async ({
			expect,
		}) => {
			const stepLimit = 3;

			const engineId = env.ENGINE.idFromName("STEP-LIMIT-AT-LIMIT");
			const freshStub = env.ENGINE.get(engineId);

			await runInDurableObject(freshStub, (engine) => {
				engine.stepLimit = stepLimit;
			});

			await setWorkflowEntrypoint(freshStub, async (_event, step) => {
				for (let i = 0; i < stepLimit; i++) {
					await step.do(`step-${i}`, async () => `result-${i}`);
				}
				return "done";
			});

			await freshStub.init(
				12346,
				{} as DatabaseWorkflow,
				{} as DatabaseVersion,
				{ id: "STEP-LIMIT-AT-LIMIT" } as DatabaseInstance,
				{
					payload: {},
					timestamp: new Date(),
					instanceId: "STEP-LIMIT-AT-LIMIT",
				}
			);

			const logs = (await freshStub.readLogs()) as EngineLogs;

			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_SUCCESS)
			).toBe(true);
			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_FAILURE)
			).toBe(false);
		});

		it("should use DEFAULT_STEP_LIMIT when no limit is configured", async ({
			expect,
		}) => {
			const engineId = env.ENGINE.idFromName("STEP-LIMIT-DEFAULT");
			const freshStub = env.ENGINE.get(engineId);

			const stepLimit = await runInDurableObject(
				freshStub,
				(engine) => engine.stepLimit
			);

			expect(stepLimit).toBe(DEFAULT_STEP_LIMIT);
		});
	});
});
