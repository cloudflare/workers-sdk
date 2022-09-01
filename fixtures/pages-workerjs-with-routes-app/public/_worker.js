export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/greeting/hello")) {
			return new Response("Bonjour le monde!");
		}

		if (url.pathname.startsWith("/greeting/goodbye")) {
			return new Response("A plus tard alligator 👋");
		}

		if (url.pathname.startsWith("/date")) {
			return new Response(new Date().toISOString());
		}

		return env.ASSETS.fetch(request);
	},
};
