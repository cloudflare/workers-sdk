import { env, RpcTarget } from "cloudflare:workers";

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
// Needs to target the Engine DO 
export async function introspectWorkflowInstance(workflow: Workflow, instanceId: string): Promise<WorkflowInstanceIntrospector> {
    if (!workflow || !instanceId) {
        throw new Error("Workflow binding and instance id are required.");
    }

    console.log(`Introspecting workflow instance: ${instanceId}`);
    
    console.log("WORKFLOW", workflow);

    await workflow.create({id: instanceId});    // why do I need to create? Worked before without it 
    const workflowInstance = await workflow.get(instanceId);
    console.log(`Workflow instance:`, workflowInstance);
    console.log("Instance status:", await workflowInstance.status());

    // env.USER_ENGINE_MY_WORKFLOW is DurableObjectNamespace {}
    // USER_ENGINE_MY_WORKFLOW is the Engine binding hardcoded from the example I'm testing
    // how to get it dinamically?
    const engineStubId = env.USER_ENGINE_MY_WORKFLOW.idFromName(instanceId);
	const engineStub = env.USER_ENGINE_MY_WORKFLOW.get(engineStubId);
    console.log("Engine status", await engineStub.getStatus());

    return new WorkflowInstanceIntrospectorHandle(engineStub, instanceId);
}

class WorkflowInstanceIntrospectorHandle implements WorkflowInstanceIntrospector {
    constructor(
    private engineStub: DurableObjectStub,
    private instanceId: string
  ) {}

  modify(fn: (m: InstanceModifier) => void): WorkflowInstanceIntrospector {
    const modifier = new InstanceModifier(this.instanceId);
    fn(modifier);
    console.log("Should allow modifications");
    return this;
  }

  async waitForStepResult(step: StepSelector): Promise<any> {
    console.log("Should await the step result of step", step.name);
    return "I waited for a step result";
  }

  async waitUntil(opts: { status: InstanceStatus }): Promise<void> {
    console.log("I waited until the Engine reached the status", opts.status);
  }

}

// This should be in Engine so that I can access Engine data:
export class InstanceModifier extends RpcTarget {

    constructor(public id: string) {
        super();
    }

    public async disableSleeps(steps?: StepSelector[]): Promise<void> {
        console.log("I should disable sleeps!")
    }

    public async mockStepImplementation(step: StepSelector): Promise<void> {
        console.log("I should mock the step implementation!")
    }
}

