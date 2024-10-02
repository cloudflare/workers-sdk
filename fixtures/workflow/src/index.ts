import {
	DurableObject,
	WorkerEntrypoint,
	Workflow as WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

type Params = {
	name: string;
};
export class Demo extends WorkflowEntrypoint<{}, Params> {
	async run(events: Array<WorkflowEvent<Params>>, step: WorkflowStep) {
		const { timestamp, payload } = events[0];
		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "1 minute");

		const result2 = await step.do("Second step", async function () {
			return {
				output: "Second step result",
			};
		});

		return {
			result,
			result2,
			timestamp,
			payload,
		};
	}
}

type Env = {
	WORKFLOW: WorkflowBinding;
};
export default class extends WorkerEntrypoint<Env> {
	async fetch() {
		const handle = await this.env.WORKFLOW.create(crypto.randomUUID(), {});
		await handle.pause();
		return new Response();
	}
}

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

class WorkflowHandle implements Instance {
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
