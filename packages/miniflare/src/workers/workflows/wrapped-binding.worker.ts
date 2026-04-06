import type { WorkflowBinding } from "@cloudflare/workflows-shared/src/binding";

class WorkflowImpl implements Workflow {
	constructor(private binding: WorkflowBinding) {}

	async get(id: string): Promise<WorkflowInstance> {
		const instanceHandle = new InstanceImpl(id, this.binding);
		// throws instance.not_found if instance doesn't exist
		// this is needed for backwards compat
		await instanceHandle.status();
		return instanceHandle;
	}

	async create(
		options?: WorkflowInstanceCreateOptions
	): Promise<WorkflowInstance> {
		using result = (await this.binding.create(options)) as WorkflowInstance &
			Disposable;

		return new InstanceImpl(result.id, this.binding);
	}

	async createBatch(
		options: WorkflowInstanceCreateOptions[]
	): Promise<WorkflowInstance[]> {
		const result = await this.binding.createBatch(options);
		return result.map((res) => {
			return new InstanceImpl(res.id, this.binding);
		});
	}

	async unsafeGetBindingName(): Promise<string> {
		return this.binding.unsafeGetBindingName();
	}

	async unsafeAbort(instanceId: string, reason?: string): Promise<void> {
		return this.binding.unsafeAbort(instanceId, reason);
	}

	async unsafeGetInstanceModifier(instanceId: string): Promise<unknown> {
		return this.binding.unsafeGetInstanceModifier(instanceId);
	}

	async unsafeWaitForStepResult(
		instanceId: string,
		name: string,
		index?: number
	): Promise<unknown> {
		return this.binding.unsafeWaitForStepResult(instanceId, name, index);
	}

	async unsafeWaitForStatus(instanceId: string, status: string): Promise<void> {
		return await this.binding.unsafeWaitForStatus(instanceId, status);
	}

	public async unsafeGetOutputOrError(
		instanceId: string,
		isOutput: boolean
	): Promise<unknown> {
		return this.binding.unsafeGetOutputOrError(instanceId, isOutput);
	}
}

class InstanceImpl implements WorkflowInstance {
	constructor(
		public id: string,
		private binding: WorkflowBinding
	) {}

	private async getInstance(): Promise<WorkflowInstance & Disposable> {
		return (await this.binding.get(this.id)) as WorkflowInstance & Disposable;
	}

	public async pause(): Promise<void> {
		using instance = await this.getInstance();
		await instance.pause();
	}

	public async resume(): Promise<void> {
		using instance = await this.getInstance();
		await instance.resume();
	}

	public async terminate(): Promise<void> {
		using instance = await this.getInstance();
		await instance.terminate();
	}

	public async restart(): Promise<void> {
		using instance = await this.getInstance();
		await instance.restart();
	}

	public async status(): Promise<InstanceStatus> {
		using instance = await this.getInstance();
		using res = (await instance.status()) as InstanceStatus & Disposable;
		return structuredClone(res);
	}

	public async sendEvent(args: {
		payload: unknown;
		type: string;
	}): Promise<void> {
		using instance = await this.getInstance();
		await instance.sendEvent(args);
	}
}

export function makeBinding(env: { binding: WorkflowBinding }): Workflow {
	return new WorkflowImpl(env.binding);
}

export default makeBinding;
