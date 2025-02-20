import {
	WorkerEntrypoint,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

export class TestWorkflow extends WorkflowEntrypoint<Env> {
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
	}

	async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		console.log("ola");
		return "test-workflow";
	}
}

export default class TestNamedEntrypoint extends WorkerEntrypoint<Env> {
	async fetch(_request: Request) {
		const workflow = await this.env.TEST_WORKFLOW.create();

		return new Response(JSON.stringify({ id: workflow.id }));
	}
}
