import {
	WorkerEntrypoint,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

export class TestWorkflow extends WorkflowEntrypoint<Env> {
	async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		console.log("ola");
		return "test-workflow";
	}
}

export default class TestNamedEntrypoint extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		const maybeId = new URL(request.url).searchParams.get("id");
		if (maybeId !== null) {
			const instance = await this.env.TEST_WORKFLOW.get(maybeId);

			return Response.json(await instance.status());
		}

		const workflow = await this.env.TEST_WORKFLOW.create();

		return new Response(JSON.stringify({ id: workflow.id }));
	}
}
