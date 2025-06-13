export default {
	async fetch(request, env, ctx) {
		return env.MTLS.fetch("https://client-cert-missing.badssl.com/");
	},
};
