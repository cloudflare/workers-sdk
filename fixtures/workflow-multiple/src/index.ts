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

		return "i'm workflow1";
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

		return "i'm workflow2";
	}
}

export class Demo3 extends WorkflowEntrypoint<{}, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.waitForEvent("wait for signal", {
			type: "continue",
		});

		const result2 = await step.do("Second step", async function () {
			return {
				output: "workflow3",
			};
		});

		return "i'm workflow3";
	}
}

type Env = {
	WORKFLOW: Workflow;
	WORKFLOW2: Workflow;
	WORKFLOW3: Workflow;
};

export default class extends WorkerEntrypoint<Env> {
	async fetch(req: Request) {
		const url = new URL(req.url);
		const id = url.searchParams.get("id");
		const workflowName = url.searchParams.get("workflowName");

		if (url.pathname === "/favicon.ico") {
			return new Response(null, { status: 404 });
		}

		let workflowToUse: Workflow;
		if (workflowName === "3") {
			workflowToUse = this.env.WORKFLOW3;
		} else if (workflowName === "2") {
			workflowToUse = this.env.WORKFLOW2;
		} else {
			workflowToUse = this.env.WORKFLOW;
		}

		let handle: WorkflowInstance;
		if (url.pathname === "/create") {
			if (id === null) {
				handle = await workflowToUse.create();
			} else {
				handle = await workflowToUse.create({ id });
			}
		} else if (url.pathname === "/pause") {
			handle = await workflowToUse.get(id);
			await handle.pause();
		} else if (url.pathname === "/resume") {
			handle = await workflowToUse.get(id);
			await handle.resume();
		} else if (url.pathname === "/restart") {
			handle = await workflowToUse.get(id);
			await handle.restart();
		} else if (url.pathname === "/terminate") {
			handle = await workflowToUse.get(id);
			await handle.terminate();
		} else if (url.pathname === "/sendEvent") {
			handle = await workflowToUse.get(id);
			await handle.sendEvent({
				type: "continue",
				payload: await req.json(),
			});
			return Response.json({ ok: true });
		} else {
			handle = await workflowToUse.get(id);
		}

		return Response.json({ status: await handle.status(), id: handle.id });
	}
}
