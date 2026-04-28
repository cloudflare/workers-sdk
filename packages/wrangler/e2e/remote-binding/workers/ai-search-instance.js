export default {
	async fetch(request, env) {
		const info = await env.AI_SEARCH_INST.info();
		return new Response(JSON.stringify(info));
	},
};
