import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

export class TestWorkflow extends WorkflowEntrypoint<Env> {
	async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		console.log("Starting running...");

		await step.do("step one", async () => {
			// some logic
			return "result of step one";
		});

		return "test-workflow";
	}
}

export class TestLongWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		await step.sleep("sleep for a while", "10 seconds");

		await step.do(
			"my step",
			{
				retries: {
					limit: 5,
					delay: 50,
					backoff: "constant",
				},
				timeout: "1 second",
			},
			async () => {
				// some logic
				return "result of my step";
			}
		);

		await step.sleep("sleep for a day", "8 hours");

		if (event.payload === "run event") {
			await step.waitForEvent("my event", {
				type: "event",
				timeout: "10 seconds",
			});
		}

		await step.sleep("sleep for a while", "5 seconds");

		return "test-workflow";
	}
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const maybeId = url.searchParams.get("id");
		if (maybeId !== null) {
			const instance = await env.TEST_WORKFLOW.get(maybeId);

			return Response.json(await instance.status());
		}

		if (url.pathname === "/long-workflow") {
			const workflow = await env.TEST_LONG_WORKFLOW.create();
			return Response.json({
				id: workflow.id,
				details: await workflow.status(),
			});
		}

		if (url.pathname === "/long-workflow-batch") {
			const workflows = await env.TEST_LONG_WORKFLOW.createBatch([
				{},
				{ id: "321" },
				{},
			]);
			const ids = workflows.map((workflow) => workflow.id);
			return Response.json({ ids: ids });
		}

		const workflow = await env.TEST_WORKFLOW.create();

		return Response.json({ id: workflow.id });
	},
};
