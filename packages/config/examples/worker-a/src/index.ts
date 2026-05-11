import {
	WorkerEntrypoint,
	DurableObject,
	WorkflowEntrypoint,
} from "cloudflare:workers";

export class MyEntrypoint extends WorkerEntrypoint {
	add(a: number, b: number) {
		return a + b;
	}
}

export class MyDurableObject extends DurableObject {
	greet(name: string) {
		return `Hello ${name}`;
	}
}

export class MyWorkflow extends WorkflowEntrypoint {}

export default {
	async fetch(_request, env, ctx) {
		const text = env.MY_TEXT;
		const result = await ctx.exports.MyEntrypoint.add(1, 2);

		return Response.json({ text, result });
	},
} satisfies ExportedHandler<Env>;
