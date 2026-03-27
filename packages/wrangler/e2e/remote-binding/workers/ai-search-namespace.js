export default {
	async fetch(request, env) {
		const id = `e2e-${crypto.randomUUID().slice(0, 8)}`;

		// Create an instance within the default namespace
		await env.AI_SEARCH_NS.create({
			id,
			type: "r2",
			source: env.R2_BUCKET_NAME,
		});

		// Get instance info
		const info = await env.AI_SEARCH_NS.get(id).info();

		// Clean up - delete the instance
		await env.AI_SEARCH_NS.delete(id);

		return new Response(JSON.stringify({ created: true, info, deleted: true }));
	},
};
