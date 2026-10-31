import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

export class MyWorkflow extends WorkflowEntrypoint {
	override async run(_: WorkflowEvent<Params>, step: WorkflowStep) {
		await step.do("first step", async () => {
			return {
				output: "First step result",
			};
		});

		await step.sleep("sleep", "1 second");

		await step.do("second step", async () => {
			return {
				output: "Second step result",
			};
		});

		return "Workflow output";
	}
}

export default {
	async fetch(request, _, ctx) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		const workflow = ctx.exports.MyWorkflow;

		if (url.pathname === "/create") {
			let instance: WorkflowInstance;
			try {
				instance = await workflow.create(id === null ? undefined : { id });
			} catch (e) {
				// Deterministic ids are unique: create() throws once the instance
				// exists, so read the existing instance instead. Any other
				// failure is real and should surface.
				const isDuplicate =
					id !== null &&
					e instanceof Error &&
					e.message.includes("instance.already_exists");
				if (!isDuplicate) {
					throw e;
				}
				instance = await workflow.get(id);
			}

			return Response.json({
				id: instance.id,
				status: await instance.status(),
			});
		}

		if (url.pathname === "/get") {
			if (id === null) {
				return new Response(
					"Please provide an id (`/get?id=unique-instance-id`)"
				);
			}

			const instance = await workflow.get(id);

			return Response.json(await instance.status());
		}

		return new Response(
			"Create a new Workflow instance (`/create` or `/create?id=unique-instance-id`) or inspect an existing instance (`/get?id=unique-instance-id`)."
		);
	},
} satisfies ExportedHandler;
