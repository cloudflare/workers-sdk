import {
	WorkerEntrypoint,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

export class TestWorkflow extends WorkflowEntrypoint<Env> {
	async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		console.log("Starting running...");

		await step.do("step one", async () => {
			return "result of step one";
		});

		return "test-workflow";
	}
}

export class TestLongWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		console.log("Starting running...");

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
				console.log("if my outcome gets mocked, this shouldn't be logging");
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
		const maybeId = new URL(request.url).searchParams.get("id");
		if (maybeId !== null) {
			const instance = await env.TEST_WORKFLOW.get(maybeId);

			return Response.json(await instance.status());
		}

		if (request.url.endsWith("/long-workflow")) {
			const workflow = await env.TEST_LONG_WORKFLOW.create();
			return new Response(JSON.stringify({ id: workflow.id }));
		}

		if (request.url.endsWith("/long-workflow-batch")) {
			const workflows = await env.TEST_LONG_WORKFLOW.createBatch([
				{},
				{ id: "321" },
				{},
			]);
			const ids = workflows.map((workflow) => workflow.id);
			return new Response(JSON.stringify({ ids: ids }));
		}

		const workflow = await env.TEST_WORKFLOW.create();

		return new Response(JSON.stringify({ id: workflow.id }));
	},
};
