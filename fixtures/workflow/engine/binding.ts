import { WorkerEntrypoint } from "cloudflare:workers";

type Env = {};

// this.env.WORKFLOW is WorkflowBinding
export class WorkflowBinding extends WorkerEntrypoint<Env> implements Workflow {
	public async create(id: string, params: unknown): Promise<Instance> {
		// Look for instance in namespace
		// TODO: Engine.init()
		return new WorkflowHandle(id);
	}

	public async get(id: string): Promise<Instance> {
		return new WorkflowHandle(id);
	}
}

export class WorkflowHandle implements Instance {
	constructor(public id: string) {}

	public async pause(): Promise<void> {
		// Look for instance in namespace
		// Get engine stub
		// Call a few functions on stub
	}

	public async resume(): Promise<void> {}

	public async abort(): Promise<void> {}

	public async restart(): Promise<void> {}

	public async status(): Promise<InstanceStatus> {
		return { status: "running" };
	}
}
