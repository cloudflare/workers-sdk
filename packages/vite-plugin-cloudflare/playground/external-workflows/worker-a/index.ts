interface Env {
	MY_WORKFLOW: Workflow;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");

		if (url.pathname === "/create") {
			let instance: WorkflowInstance;
			try {
				instance = await env.MY_WORKFLOW.create(
					id === null ? undefined : { id }
				);
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
				instance = await env.MY_WORKFLOW.get(id);
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

			const instance = await env.MY_WORKFLOW.get(id);

			return Response.json(await instance.status());
		}

		return new Response(
			"Create a new Workflow instance (`/create` or `/create?id=unique-instance-id`) or inspect an existing instance (`/get?id=unique-instance-id`)."
		);
	},
} satisfies ExportedHandler<Env>;
