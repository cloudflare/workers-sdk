import { waitUntil } from "async-wait-until";
import { env, RpcTarget } from "cloudflare:workers";

// import { instanceStatusName } from "@cloudflare/workflows-shared";

export enum InstanceStatus {
	Queued = 0, // Queued and waiting to start
	Running = 1,
	Paused = 2, // TODO (WOR-73): Implement pause
	Errored = 3, // Stopped due to a user or system Error
	Terminated = 4, // Stopped explicitly by user
	Complete = 5, // Successful completion
	// TODO (WOR-71): Sleep
}

export function instanceStatusName(status: InstanceStatus) {
	switch (status) {
		case InstanceStatus.Queued:
			return "queued";
		case InstanceStatus.Running:
			return "running";
		case InstanceStatus.Paused:
			return "paused";
		case InstanceStatus.Errored:
			return "errored";
		case InstanceStatus.Terminated:
			return "terminated";
		case InstanceStatus.Complete:
			return "complete";
		default:
			return "unknown";
	}
}

export type StepSelector = {
	name: string;
	index?: number;
};

export type WorkflowInstanceIntrospector = {
	modify(fn: (m: InstanceModifier) => void): WorkflowInstanceIntrospector;

	waitForStepResult(step: StepSelector): Promise<any>;

	waitUntil(opts: { status: InstanceStatus }): Promise<void>;
};

/**
 * Entry point that targets a single Workflow instance
 * This would allow to apply test rules and mocks to the given instance
 */
export async function introspectWorkflowInstance(
	workflow: Workflow,
	instanceId: string
): Promise<WorkflowInstanceIntrospector> {
	if (!workflow || !instanceId) {
		throw new Error("Workflow binding and instance id are required.");
	}

	console.log(`Introspecting workflow instance: ${instanceId}`);

	console.log("WORKFLOW", workflow);

	await workflow.create({ id: instanceId }); // why do I need to create? Worked before without it
	const workflowInstance = await workflow.get(instanceId);
	console.log(`Workflow instance:`, workflowInstance);
	console.log("Instance status:", await workflowInstance.status());

	// env.USER_ENGINE_MY_WORKFLOW is DurableObjectNamespace {}
	// USER_ENGINE_MY_WORKFLOW is the Engine binding hardcoded from the example I'm testing
	// TODO: how to get it dinamically
	console.log("THIS IS ENV", env);
	const engineStubId = env.USER_ENGINE_MY_WORKFLOW.idFromName(instanceId);
	const engineStub = env.USER_ENGINE_MY_WORKFLOW.get(engineStubId);
	console.log("Engine status", await engineStub.getStatus());

	const instanceModifier = await engineStub.getInstanceModifier();

	return new WorkflowInstanceIntrospectorHandle(
		engineStub,
		instanceId,
		instanceModifier
	);
}

class WorkflowInstanceIntrospectorHandle
	implements WorkflowInstanceIntrospector
{
	engineStub: DurableObjectStub;
	instanceId: string;
	instanceModifier: InstanceModifier;
	constructor(
		engineStub: DurableObjectStub,
		instanceId: string,
		instanceModifier: InstanceModifier
	) {
		this.engineStub = engineStub;
		this.instanceId = instanceId;
		this.instanceModifier = instanceModifier;
	}

	async modify(
		fn: (m: InstanceModifier) => void
	): WorkflowInstanceIntrospector {
		const modifier = this.engineStub.getInstanceModifier();
		await fn(modifier);
		console.log("Should allow modifications");
		return this;
	}

	async waitForStepResult(step: StepSelector): Promise<any> {
		console.log("Should await the step result of step", step.name);
		return "I waited for a step result";
	}

	async waitUntil(opts: { status: InstanceStatus }): Promise<void> {
		// console.log("I waited until the Engine reached the status", opts.status);
		await waitUntil(async () => {
			const currentStatus = instanceStatusName(
				await this.engineStub.getStatus()
			);
			console.log("status from engine", currentStatus);
			console.log("status user wants", opts.status);
			return currentStatus === opts.status;
		});
	}
}
