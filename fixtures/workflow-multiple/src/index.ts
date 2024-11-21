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

		await step.sleep("Wait", "1 second");

		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "1 second");

		const result2 = await step.do("Second step", async function () {
			return {
				output: "workflow1",
			};
		});

		return [result, result2, timestamp, payload, "workflow1"];
	}
}

export class Demo2 extends WorkflowEntrypoint<{}, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { timestamp, payload } = event;

		await step.sleep("Wait", "1 second");

		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "1 second");

		const result2 = await step.do("Second step", async function () {
			return {
				output: "workflow2",
			};
		});

		return [result, result2, timestamp, payload, "workflow2"];
	}
}

type Env = {
	WORKFLOW: Workflow;
	WORKFLOW2: Workflow;
};

export default class extends WorkerEntrypoint<Env> {
	async fetch(req: Request) {
		const url = new URL(req.url);
		const id = url.searchParams.get("id");
		const workflowName = url.searchParams.get("workflowName");

		if (url.pathname === "/favicon.ico") {
			return new Response(null, { status: 404 });
		}
		let workflowToUse =
			workflowName == "2" ? this.env.WORKFLOW2 : this.env.WORKFLOW;

		let handle: WorkflowInstance;
		if (url.pathname === "/create") {
			if (id === null) {
				handle = await workflowToUse.create();
			} else {
				handle = await workflowToUse.create({ id });
			}
		} else {
			handle = await workflowToUse.get(id);
		}

		return Response.json({ status: await handle.status(), id: handle.id });
	}
}
