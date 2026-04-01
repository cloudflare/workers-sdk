export default {
	async fetch(_request, env) {
		const memoryContext = env.MEMORY.getContext("wrangler-e2e");
		const summary = await memoryContext.getSummary();
		return new Response(JSON.stringify(summary));
	},
};
