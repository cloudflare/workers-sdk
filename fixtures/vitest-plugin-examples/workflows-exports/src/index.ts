import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

type Params = { name: string };

export class GreetingWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep) {
		return await step.do("greet", async () => `Hello, ${event.payload.name}!`);
	}
}

export default {
	async fetch(request, _env, ctx) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		if (id !== null) {
			const instance = await ctx.exports.GreetingWorkflow.get(id);
			return Response.json(await instance.status());
		}

		const instance = await ctx.exports.GreetingWorkflow.create({
			params: { name: url.searchParams.get("name") ?? "World" },
		});
		return Response.json({ id: instance.id });
	},
} satisfies ExportedHandler<Env>;
