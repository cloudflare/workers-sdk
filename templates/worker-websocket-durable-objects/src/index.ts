// @ts-ignore
import indexHtml from './public/index.html';

type Environment = {
	DO_WEBSOCKET: DurableObjectNamespace;
};

export { WebSocketDurableObject } from './durable-object';

const worker: ExportedHandler<Environment> = {
	async fetch(request, env) {
		const url = new URL(request.url);

		// pass the request to Durable Object for any WebSocket connection
		if (request.headers.get('upgrade') === 'websocket') {
			const durableObjectId = env.DO_WEBSOCKET.idFromName(url.pathname);
			const durableObjectStub = env.DO_WEBSOCKET.get(durableObjectId);
			return durableObjectStub.fetch(request);
		}

		// return static HTML
		return new Response(indexHtml, {
			headers: { 'content-type': 'text/html' },
		});
	},
};

export default worker;
