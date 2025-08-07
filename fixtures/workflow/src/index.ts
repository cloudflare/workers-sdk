import {
	WorkerEntrypoint,
	WorkflowBackoff,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

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

		return payload ?? "no-payload";
	}
}

export class Demo2 extends WorkflowEntrypoint<{}, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { timestamp, payload } = event;

		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.waitForEvent("event-1 provider", {
			type: "event-1",
		});

		const result2 = await step.do("Second step", async function () {
			return {
				output: "Second step result",
			};
		});

		return payload ?? "no-payload";
	}
}

export class Demo3 extends WorkflowEntrypoint<{}, Params> {
	async run(
		event: WorkflowEvent<Params & { doRetry: boolean; errorMessage: string }>,
		step: WorkflowStep
	) {
		let runs = -1;
		try {
			await step.do(
				"First (and only step) step",
				{
					retries: {
						limit: 3,
						delay: 100,
					},
				},
				async function () {
					runs++;
					if (event.payload.doRetry) {
						throw new Error(event.payload.errorMessage);
					} else {
						throw new NonRetryableError(event.payload.errorMessage);
					}
				}
			);
		} catch {}

		return `The step was retried ${runs} time${runs === 1 ? "" : "s"}`;
	}
}

type Env = {
	WORKFLOW: Workflow;
	WORKFLOW2: Workflow;
	WORKFLOW3: Workflow<{ doRetry: boolean; errorMessage: string }>;
};
export default class extends WorkerEntrypoint<Env> {
	async fetch(req: Request) {
		const url = new URL(req.url);
		const id = url.searchParams.get("workflowName");
		const doRetry = url.searchParams.get("doRetry");
		const errorMessage = url.searchParams.get("errorMessage");

		if (url.pathname === "/favicon.ico") {
			return new Response(null, { status: 404 });
		}

		let handle: WorkflowInstance;
		if (url.pathname === "/createBatch") {
			// creates two instances
			const batch = await this.env.WORKFLOW.createBatch([
				{ id: "batch-1", params: "1" },
				{ id: "batch-2", params: "2" },
			]);
			return Response.json(batch.map((instance) => instance.id));
		} else if (url.pathname === "/create") {
			if (id === null) {
				handle = await this.env.WORKFLOW.create();
			} else {
				handle = await this.env.WORKFLOW.create({ id });
			}
		} else if (url.pathname === "/createDemo2") {
			if (id === null) {
				handle = await this.env.WORKFLOW2.create();
			} else {
				handle = await this.env.WORKFLOW2.create({ id });
			}
		} else if (url.pathname === "/createDemo3") {
			if (id === null) {
				handle = await this.env.WORKFLOW3.create();
			} else {
				handle = await this.env.WORKFLOW3.create({
					id,
					params: {
						doRetry: doRetry === "false" ? false : true,
						errorMessage: errorMessage ?? "",
					},
				});
			}
		} else if (url.pathname === "/sendEvent") {
			handle = await this.env.WORKFLOW2.get(id);

			await handle.sendEvent({
				type: "event-1",
				payload: await req.json(),
			});
		} else if (url.pathname === "/get2") {
			handle = await this.env.WORKFLOW2.get(id);
		} else if (url.pathname === "/get3") {
			handle = await this.env.WORKFLOW3.get(id);
		} else {
			handle = await this.env.WORKFLOW.get(id);
		}

		return Response.json(await handle.status());
	}
}
