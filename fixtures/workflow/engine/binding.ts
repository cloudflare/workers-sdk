import { WorkerEntrypoint } from "cloudflare:workers";
import { instanceStatusName } from "./instance";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	Engine,
} from "./engine";

type Env = {
	ENGINE: DurableObjectNamespace<Engine>;
};

// this.env.WORKFLOW is WorkflowBinding
export class WorkflowBinding extends WorkerEntrypoint<Env> implements Workflow {
	public async create(
		id: string,
		params: Record<string, unknown>
	): Promise<Instance> {
		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);

		await stub.init(
			0, // accountId: number,
			{} as DatabaseWorkflow, // workflow: DatabaseWorkflow,
			{} as DatabaseVersion, // version: DatabaseVersion,
			{ id } as DatabaseInstance, // instance: DatabaseInstance,
			{
				timestamp: new Date(),
				payload: params,
			}
		);

		return new WorkflowHandle(id, stub);
	}

	public async get(id: string): Promise<Instance> {
		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);
		return new WorkflowHandle(id, stub);
	}
}

export class WorkflowHandle implements Instance {
	constructor(
		public id: string,
		private stub: DurableObjectStub<Engine>
	) {}

	public async pause(): Promise<void> {
		// Look for instance in namespace
		// Get engine stub
		// Call a few functions on stub
		throw new Error("Not implemented yet");
	}

	public async resume(): Promise<void> {
		throw new Error("Not implemented yet");
	}

	public async abort(): Promise<void> {
		throw new Error("Not implemented yet");
	}

	public async restart(): Promise<void> {
		throw new Error("Not implemented yet");
	}

	public async status(): Promise<InstanceStatus> {
		const status = await this.stub.getStatus(0, this.id);
		return { status: instanceStatusName(status) }; // output, error
	}
}
