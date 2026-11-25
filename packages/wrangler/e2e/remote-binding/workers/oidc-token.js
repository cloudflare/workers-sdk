export default {
	async fetch(request, env) {
		return env.OIDC_WORKER.fetch("http://example.com");
	},
};
