export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/version_metadata") {
			return Response.json(env.METADATA);
		}

		if (url.pathname === "/holiday") {
			return new Response(
				`[/holiday]:\n` +
					`🎶 🎶 🎶\n` +
					`If we took a ${env.VAR2}\n` +
					`Took some time to ${env.VAR1}\n` +
					`Just one day out of life\n` +
					`It would be, it would be so nice 🎉\n` +
					`🎶 🎶 🎶`
			);
		}

		if (url.pathname === "/celebrate") {
			return new Response(
				`[/celebrate]:\n` +
					`🎶 🎶 🎶\n` +
					`Everybody spread the word\n` +
					`We're gonna have a ${env.VAR3}\n` +
					`All across the world\n` +
					`In every nation\n` +
					`🎶 🎶 🎶`
			);
		}

		if (url.pathname === "/oh-yeah") {
			return new Response(
				`[/oh-yeah]: 🎶 🎶 🎶 ${env.VAR2} (ooh yeah, ooh yeah)🎶 🎶 🎶`
			);
		}

		return env.ASSETS.fetch(request);
	},
};
