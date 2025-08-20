import {
	instanceStatusName,
	InstanceStatus as InstanceStatusNumber,
} from "@cloudflare/workflows-shared/src/instance";
import { WorkflowIntrospectorError } from "@cloudflare/workflows-shared/src/modifier";
import { WORKFLOW_ENGINE_BINDING } from "../shared/workflows";
import { internalEnv } from "./env";
import type { InstanceModifier } from "@cloudflare/workflows-shared/src/modifier";

export type StepSelector = {
	name: string;
	index?: number;
};

export type WorkflowInstanceIntrospector = {
	modify(
		fn: (m: InstanceModifier) => Promise<void>
	): Promise<WorkflowInstanceIntrospector>;

	waitForStepResult(step: StepSelector): Promise<unknown>;

	waitForStatus(status: string): Promise<void>;

	cleanUp(): Promise<void>;
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

	console.log(
		`[Vitest-Workflows] Introspecting workflow instance: ${instanceId}`
	);

	// @ts-expect-error getWorkflowName() not exposed
	const engineBindingName = `${WORKFLOW_ENGINE_BINDING}${(await workflow.getWorkflowName()).toUpperCase()}`;
	// @ts-expect-error DO binding created in runner worker start
	const engineStubId = internalEnv[engineBindingName].idFromName(instanceId);
	// @ts-expect-error DO binding created in runner worker start
	const engineStub = internalEnv[engineBindingName].get(engineStubId);

	const instanceModifier = await engineStub.getInstanceModifier();

	return new WorkflowInstanceIntrospectorHandle(engineStub, instanceModifier);
}

class WorkflowInstanceIntrospectorHandle
	implements WorkflowInstanceIntrospector
{
	engineStub: DurableObjectStub;
	instanceModifier: InstanceModifier;
	constructor(
		engineStub: DurableObjectStub,
		instanceModifier: InstanceModifier
	) {
		this.engineStub = engineStub;
		this.instanceModifier = instanceModifier;
	}

	async modify(
		fn: (m: InstanceModifier) => Promise<void>
	): Promise<WorkflowInstanceIntrospector> {
		console.log("[Vitest-Workflows] I should go call a modifier");
		await fn(this.instanceModifier);
		return this;
	}

	async waitForStepResult(step: StepSelector): Promise<unknown> {
		console.log("waiting for step result of step", step.name);
		// @ts-expect-error waitForStepResult not exposed
		const stepResult = await this.engineStub.waitForStepResult(
			step.name,
			step.index
		);

		console.log("result of step", step.name, "awaited");
		return stepResult;
	}

	async waitForStatus(status: InstanceStatus["status"]): Promise<void> {
		console.log("[Vitest-Workflows] waiting for status");

		if (
			status === instanceStatusName(InstanceStatusNumber.Terminated) ||
			status === instanceStatusName(InstanceStatusNumber.Paused)
		) {
			throw new WorkflowIntrospectorError(
				`InstanceStatus '${status}' is not implemented yet and cannot be waited.`
			);
		}

		if (status === instanceStatusName(InstanceStatusNumber.Queued)) {
			// we currently don't have a queue mechanism, but it would happen before it
			// starts running, so waiting for it to be queued should always return
			return;
		}
		// @ts-expect-error waitForStatus not exposed
		await this.engineStub.waitForStatus(status);

		console.log("[Vitest-Workflows] status awaited");
	}

	async cleanUp(): Promise<void> {
		// this cleans state with isolatedStorage = false
		try {
			// @ts-expect-error DO binding created in runner worker start
			await this.engineStub.unsafeAbort("user called delete");
		} catch {
			// do nothing because we want to clean up this instance
		}
	}
}
