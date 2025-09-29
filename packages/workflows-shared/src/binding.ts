import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { InstanceEvent, instanceStatusName } from "./instance";
import { WorkflowError } from "./lib/errors";
import { isValidWorkflowInstanceId } from "./lib/validators";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	Engine,
	EngineLogs,
} from "./engine";

type Env = {
	ENGINE: DurableObjectNamespace<Engine>;
	BINDING_NAME: string;
};

// this.env.WORKFLOW is WorkflowBinding
export class WorkflowBinding extends WorkerEntrypoint<Env> implements Workflow {
	public async create({
		id = crypto.randomUUID(),
		params = {},
	}: WorkflowInstanceCreateOptions = {}): Promise<WorkflowInstance> {
		if (!isValidWorkflowInstanceId(id)) {
			throw new WorkflowError("Workflow instance has invalid id");
		}

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
				instanceId: id,
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
			sendEvent: handle.sendEvent.bind(handle),
		};
	}

	public async get(id: string): Promise<WorkflowInstance> {
		const engineStubId = this.env.ENGINE.idFromName(id);
		const engineStub = this.env.ENGINE.get(engineStubId);

		const handle = new WorkflowHandle(id, engineStub);

		try {
			await handle.status();
		} catch {
			throw new Error("instance.not_found");
		}

		return {
			id: id,
			pause: handle.pause.bind(handle),
			resume: handle.resume.bind(handle),
			terminate: handle.terminate.bind(handle),
			restart: handle.restart.bind(handle),
			status: handle.status.bind(handle),
			sendEvent: handle.sendEvent.bind(handle),
		};
	}
	public async createBatch(
		batch: WorkflowInstanceCreateOptions<unknown>[]
	): Promise<WorkflowInstance[]> {
		if (batch.length === 0) {
			throw new Error(
				"WorkflowError: batchCreate should have at least 1 instance"
			);
		}

		return await Promise.all(batch.map((val) => this.create(val)));
	}

	public unsafeGetBindingName(): string {
		return this.env.BINDING_NAME;
	}

	public unsafeGetInstanceModifier(instanceId: string): unknown {
		const stubId = this.env.ENGINE.idFromName(instanceId);
		const stub = this.env.ENGINE.get(stubId);

		const instanceModifier = stub.getInstanceModifier();

		return instanceModifier;
	}

	public async unsafeWaitForStepResult(
		instanceId: string,
		name: string,
		index?: number
	): Promise<unknown> {
		const stubId = this.env.ENGINE.idFromName(instanceId);
		const stub = this.env.ENGINE.get(stubId);

		return await stub.waitForStepResult(name, index);
	}

	public async unsafeAbort(instanceId: string, reason?: string): Promise<void> {
		const stubId = this.env.ENGINE.idFromName(instanceId);
		const stub = this.env.ENGINE.get(stubId);

		try {
			await stub.unsafeAbort(reason);
		} catch {
			// do nothing because we want to dispose this instance
		}
	}

	public async unsafeWaitForStatus(
		instanceId: string,
		status: string
	): Promise<void> {
		const stubId = this.env.ENGINE.idFromName(instanceId);
		const stub = this.env.ENGINE.get(stubId);
		return await stub.waitForStatus(status);
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

	public async status(): Promise<
		InstanceStatus & { __LOCAL_DEV_STEP_OUTPUTS: unknown[] }
	> {
		const status = await this.stub.getStatus(0, this.id);

		// NOTE(lduarte): for some reason, sync functions over RPC are typed as never instead of Promise<EngineLogs>
		const { logs } =
			await (this.stub.readLogs() as unknown as Promise<EngineLogs>);

		const workflowSuccessEvent = logs
			.filter((log) => log.event === InstanceEvent.WORKFLOW_SUCCESS)
			.at(0);

		const filteredLogs = logs.filter(
			(log) =>
				log.event === InstanceEvent.STEP_SUCCESS ||
				log.event === InstanceEvent.WAIT_COMPLETE
		);

		const stepOutputs = filteredLogs.map((log) =>
			log.event === InstanceEvent.STEP_SUCCESS
				? log.metadata.result
				: log.metadata.payload
		);

		const workflowOutput =
			workflowSuccessEvent !== undefined
				? workflowSuccessEvent.metadata.result
				: null;

		return {
			status: instanceStatusName(status),
			__LOCAL_DEV_STEP_OUTPUTS: stepOutputs,
			// @ts-expect-error types are wrong, will remove this expect-error once I fix them
			output: workflowOutput,
		}; // output, error
	}

	public async sendEvent(args: {
		payload: unknown;
		type: string;
	}): Promise<void> {
		await this.stub.receiveEvent({
			payload: args.payload,
			type: args.type,
			timestamp: new Date(),
		});
	}
}
