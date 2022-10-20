export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/greeting/hello")) {
			return new Response("Bonjour le monde!");
		}

		if (url.pathname.startsWith("/greeting/goodbye")) {
			return new Response("A plus tard alligator 👋");
		}

		if (url.pathname.startsWith("/party")) {
			return new Response("Oops! Tous les alligators sont allés à la fête 🎉");
		}

		if (url.pathname.startsWith("/date")) {
			return new Response(new Date().toISOString());
		}

		if (url.pathname === "/") {
			return new Response("ROOT");
		}

		return env.ASSETS.fetch(request);
	},
};
