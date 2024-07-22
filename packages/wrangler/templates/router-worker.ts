// TODO
export default {
	fetch(request, env) {
		return env.EXPERIMENTAL_ASSETS.fetch(request);
	},
};
