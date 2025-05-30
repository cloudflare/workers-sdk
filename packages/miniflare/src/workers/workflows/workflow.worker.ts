interface Env {
	fetcher: Fetcher;
}

class LocalWorkflow implements Workflow {
	constructor(private env: Env) {}
	public create(
		options?: WorkflowInstanceCreateOptions<unknown> | undefined
	): Promise<WorkflowInstance> {
		throw new Error("Method not implemented.");
	}
	public createBatch(
		batch: WorkflowInstanceCreateOptions<unknown>[]
	): Promise<WorkflowInstance[]> {
		throw new Error("Method not implemented.");
	}

	async get(id: string): Promise<WorkflowInstance> {
		return {} as WorkflowInstance;
	}
}

export default function (env: Env) {
	return new LocalWorkflow(env);
}
