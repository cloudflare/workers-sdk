import { RpcTarget, WorkerEntrypoint, WorkflowEvent } from "cloudflare:workers";
import { InstanceEvent, instanceStatusName } from "./instance";
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
	public async create({
		name = "defaultWorkflow",
		params,
	}: WorkflowInstanceCreateOptions): Promise<Instance> {
		const stubId = this.env.ENGINE.idFromName(name);
		const stub = this.env.ENGINE.get(stubId);

		void stub.init(
			0, // accountId: number,
			{} as DatabaseWorkflow, // workflow: DatabaseWorkflow,
			{} as DatabaseVersion, // version: DatabaseVersion,
			{ name } as DatabaseInstance, // instance: DatabaseInstance,
			{
				timestamp: new Date(),
				payload: params as Readonly<typeof params>,
			}
		);

		return new WorkflowHandle(name, stub);
	}

	public async get(id: string): Promise<Instance> {
		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);
		return new WorkflowHandle(id, stub);
	}
}

export class WorkflowHandle extends RpcTarget implements Instance {
	constructor(
		public id: string,
		private stub: DurableObjectStub<Engine>
	) {
		super();
	}

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
		const { logs } = await this.stub.readLogs();
		// @ts-expect-error TODO: Fix this
		const filteredLogs = logs.filter(
			// @ts-expect-error TODO: Fix this
			(log) => log.event === InstanceEvent.STEP_SUCCESS
		);
		// @ts-expect-error TODO: Fix this
		const output = filteredLogs.map((log) => log.metadata.result);
		return { status: instanceStatusName(status), output }; // output, error
	}
}
