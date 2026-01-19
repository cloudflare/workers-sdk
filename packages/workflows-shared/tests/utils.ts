import {
	createExecutionContext,
	env,
	runInDurableObject,
} from "cloudflare:test";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	Engine,
} from "../src/engine";
import type { ProvidedEnv } from "cloudflare:test";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

export async function setWorkflowEntrypoint(
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

export async function runWorkflow(
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

export async function runWorkflowDefer(
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
