export default {
	async fetch(request, env, context) {
		const response = await env.ASSETS.fetch(request.url, request);
		return new Response(response.body, response);
	},
};
