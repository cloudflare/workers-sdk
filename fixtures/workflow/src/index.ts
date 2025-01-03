import {
	WorkerEntrypoint,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

type Params = {
	name: string;
};

export class Demo extends WorkflowEntrypoint<{}, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { timestamp, payload } = event;

		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "1 second");

		const result2 = await step.do("Second step", async function () {
			return {
				output: "Second step result",
			};
		});

		return "i'm a workflow output";
	}
}

type Env = {
	WORKFLOW: Workflow;
};
export default class extends WorkerEntrypoint<Env> {
	async fetch(req: Request) {
		const url = new URL(req.url);
		const id = url.searchParams.get("workflowName");

		if (url.pathname === "/favicon.ico") {
			return new Response(null, { status: 404 });
		}

		let handle: WorkflowInstance;
		if (url.pathname === "/create") {
			if (id === null) {
				handle = await this.env.WORKFLOW.create();
			} else {
				handle = await this.env.WORKFLOW.create({ id });
			}
		} else {
			handle = await this.env.WORKFLOW.get(id);
		}

		return Response.json(await handle.status());
	}
}
