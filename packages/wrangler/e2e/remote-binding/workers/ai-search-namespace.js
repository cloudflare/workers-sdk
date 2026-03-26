export default {
	async fetch(request, env) {
		const name = `e2e-${crypto.randomUUID().slice(0, 8)}`;

		// Create an instance within the default namespace
		await env.AI_SEARCH_NS.create({ name });

		// Get instance info
		const info = await env.AI_SEARCH_NS.get(name).info();

		// Clean up - delete the instance
		await env.AI_SEARCH_NS.delete(name);

		return new Response(JSON.stringify({ created: true, info, deleted: true }));
	},
};
