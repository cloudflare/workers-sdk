export { MyWorkflow } from "./index";

export default {
	async fetch(request, _, ctx) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");

		if (url.pathname === "/create") {
			const instance = await ctx.exports.MyWorkflow.create(
				id === null ? undefined : { id }
			);

			return Response.json({
				id: instance.id,
				status: await instance.status(),
			});
		}

		if (url.pathname === "/get" && id !== null) {
			const instance = await ctx.exports.MyWorkflow.get(id);

			return Response.json(await instance.status());
		}

		return new Response(
			"Create a new Workflow instance (`/create` or `/create?id=unique-instance-id`) or inspect an existing instance (`/get?id=unique-instance-id`)."
		);
	},
} satisfies ExportedHandler;
