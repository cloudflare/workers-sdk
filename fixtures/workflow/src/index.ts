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

		const result = await step.do("First step", {}, async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "5 seconds");

		const result2 = await step.do("Second step", {}, async function () {
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
	WORKFLOW: Workflow;
};
export default class extends WorkerEntrypoint<Env> {
	async fetch(req: Request) {
		const url = new URL(req.url);
		const name = url.searchParams.get("workflowName");

		if (url.pathname === "/favicon.ico") {
			return new Response(null, { status: 404 });
		}

		let handle: Instance;
		if (url.pathname === "/create") {
			handle = await this.env.WORKFLOW.create({ name });
		} else {
			// @ts-ignore getByName exists in the next version of workerd
			handle = await this.env.WORKFLOW.getByName(name);
		}

		return Response.json(await handle.status());
	}
}
