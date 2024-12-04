import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
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
		id = crypto.randomUUID(),
		params = {},
	}: WorkflowInstanceCreateOptions = {}): Promise<WorkflowInstance> {
		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);

		void stub.init(
			0, // accountId: number,
			{} as DatabaseWorkflow, // workflow: DatabaseWorkflow,
			{} as DatabaseVersion, // version: DatabaseVersion,
			{ id } as DatabaseInstance, // instance: DatabaseInstance,
			{
				timestamp: new Date(),
				payload: params as Readonly<typeof params>,
			}
		);

		const handle = new WorkflowHandle(id, stub);
		return {
			id: id,
			pause: handle.pause.bind(handle),
			resume: handle.resume.bind(handle),
			terminate: handle.terminate.bind(handle),
			restart: handle.restart.bind(handle),
			status: handle.status.bind(handle),
		};
	}

	public async get(id: string): Promise<WorkflowInstance> {
		const engineStubId = this.env.ENGINE.idFromName(id);
		const engineStub = this.env.ENGINE.get(engineStubId);

		const handle = new WorkflowHandle(id, engineStub);

		try {
			await handle.status();
		} catch (e) {
			throw new Error("instance.not_found");
		}

		return {
			id: id,
			pause: handle.pause.bind(handle),
			resume: handle.resume.bind(handle),
			terminate: handle.terminate.bind(handle),
			restart: handle.restart.bind(handle),
			status: handle.status.bind(handle),
		};
	}
}

export class WorkflowHandle extends RpcTarget implements WorkflowInstance {
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

	public async terminate(): Promise<void> {
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
