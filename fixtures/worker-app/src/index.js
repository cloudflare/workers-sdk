export default {
	async fetch(request, env) {
		return env.VECTORIZE.fetch(request);
	},
};
