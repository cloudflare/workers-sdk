export default {
	async fetch(_request, env) {
		const profile = env.MEMORY.getProfile("wrangler-e2e");
		const summary = await profile.getSummary();
		return new Response(JSON.stringify(summary));
	},
};
