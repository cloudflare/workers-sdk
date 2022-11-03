export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			return new Response("ROOT");
		}

		if (url.pathname === "/party") {
			return new Response(
				"[/party]: Oops! Tous les alligators sont allés à la fête 🎉"
			);
		}

		if (url.pathname === "/party-disco") {
			return new Response("[/party-disco]: Tout le monde à la discothèque 🪩");
		}

		if (url.pathname === "/date") {
			return new Response(`[/date]: ${new Date().toISOString()}`);
		}

		if (url.pathname === "/greeting") {
			return new Response("[/greeting]: Bonjour à tous!");
		}

		if (url.pathname === "/greeting/hello") {
			return new Response("[/greeting/hello]: Bonjour le monde!");
		}

		if (url.pathname === "/greeting/bye") {
			return new Response("[/greeting/bye]: A plus tard alligator 👋");
		}

		if (url.pathname === "/greetings") {
			return new Response("[/greetings]: Bonjour alligators!");
		}

		return env.ASSETS.fetch(request);
	},
};
