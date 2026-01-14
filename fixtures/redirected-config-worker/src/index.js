export default {
	async fetch(request, env) {
		return new Response("Generated: " + (env.generated ?? false));
	},
};
