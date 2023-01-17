// @ts-ignore
import indexHtml from './public/index.html';

declare global {
	var MINIFLARE: boolean;
}

interface Environment {
	DO_WORDLE: DurableObjectNamespace;
}

export { WordleDurableObject } from './durable-object';

const worker: ExportedHandler<Environment> = {
	async fetch(request, env) {
		const url = new URL(request.url);

		let gameId: string | void;

		if (url.pathname.startsWith('/g/')) {
			// game id from a game name
			gameId = env.DO_WORDLE.idFromName(url.pathname).toString();
		} else {
			// game id from url
			gameId = url.pathname.substring(1);

			if (globalThis.MINIFLARE && !gameId) {
				// generate a random game identifier in devmode
				gameId = env.DO_WORDLE.newUniqueId().toString();
			}
		}

		// redirect to a new Wordle game ID for /new
		if (gameId === 'new' || !gameId) {
			url.search = ''; // clear any query string
			gameId = env.DO_WORDLE.newUniqueId().toString();
			const target = new URL(`/${gameId}`, url.href);
			return Response.redirect(target.href, 302);
		}

		// pass the request to Durable Object for game ID
		if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
			const id = env.DO_WORDLE.idFromString(gameId);
			return env.DO_WORDLE.get(id).fetch(request);
		}

		return new Response(indexHtml, {
			headers: { 'content-type': 'text/html' },
		});
	},
};

export default worker;
