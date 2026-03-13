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
export class WorkflowBinding extends WorkerEntrypoint<Env> {
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
	}

	public async create({
		id = crypto.randomUUID(),
		params = {},
	}: WorkflowInstanceCreateOptions = {}): Promise<{
		id: string;
	}> {
		if (!isValidWorkflowInstanceId(id)) {
			throw new WorkflowError("Workflow instance has invalid id");
		}

		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);

		const initPromise = stub
			.init(
				0, // accountId: number,
				{} as DatabaseWorkflow, // workflow: DatabaseWorkflow,
				{} as DatabaseVersion, // version: DatabaseVersion,
				{ id } as DatabaseInstance, // instance: DatabaseInstance,
				{
					timestamp: new Date(),
					payload: params as Readonly<typeof params>,
					instanceId: id,
				}
			)
			.then((val) => {
				if (val !== undefined) {
					val[Symbol.dispose]();
				}
			});

		this.ctx.waitUntil(initPromise);

		return {
			id,
		};
	}

	public async get(id: string): Promise<WorkflowInstance> {
		const stubId = this.env.ENGINE.idFromName(id);
		const stub = this.env.ENGINE.get(stubId);
		const handle = new WorkflowHandle(id, stub);

		try {
			await handle.status();
		} catch {
			throw new Error("instance.not_found");
		}

		return handle;
	}

	public async createBatch(
		batch: WorkflowInstanceCreateOptions<unknown>[]
	): Promise<{ id: string }[]> {
		if (batch.length === 0) {
			throw new Error(
				"WorkflowError: batchCreate should have at least 1 instance"
			);
		}

		return await Promise.all(
			batch.map(async (val) => {
				const res = await this.create(val);
				return res;
			})
		);
	}

	public async unsafeGetBindingName(): Promise<string> {
		// async because of rpc
		return this.env.BINDING_NAME;
	}

	public async unsafeGetInstanceModifier(instanceId: string): Promise<unknown> {
		// async because of rpc
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

	public async unsafeGetOutputOrError(
		instanceId: string,
		isOutput: boolean
	): Promise<unknown> {
		const stubId = this.env.ENGINE.idFromName(instanceId);
		const stub = this.env.ENGINE.get(stubId);
		return await stub.getOutputOrError(isOutput);
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
		const status = await this.stub.getStatus();

		// NOTE(lduarte): for some reason, sync functions over RPC are typed as never instead of Promise<EngineLogs>
		using logs = await (this.stub.readLogs() as unknown as Promise<
			EngineLogs & Disposable
		>);

		const filteredLogs = logs.logs.filter(
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
			logs.logs.find((log) => log.event === InstanceEvent.WORKFLOW_SUCCESS)
				?.metadata.result ?? null;

		const workflowError = logs.logs.find(
			(log) => log.event === InstanceEvent.WORKFLOW_FAILURE
		)?.metadata.error;

		return {
			status: instanceStatusName(status),
			__LOCAL_DEV_STEP_OUTPUTS: stepOutputs,
			output: workflowOutput,
			error: workflowError,
		};
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
