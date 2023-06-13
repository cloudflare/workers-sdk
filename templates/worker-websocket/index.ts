import template from './template';

let count = 0;
async function handleSession(websocket: WebSocket) {
	websocket.accept();
	websocket.addEventListener('message', async event => {
		if (event.type === 'CLICK') {
			count += 1;
			websocket.send(JSON.stringify({ count, tz: new Date() }));
		} else {
			// An unknown message came into the server. Send back an error message
			websocket.send(JSON.stringify({ error: 'Unknown message received', tz: new Date() }));
		}
	});

	websocket.addEventListener('close', async event => {
		// Handle when a client closes the WebSocket connection
		console.log(event);
	});
}

async function websocketHandler(req: Request) {
	const upgradeHeader = req.headers.get('Upgrade');
	if (upgradeHeader !== 'websocket') {
		return new Response('Expected websocket', { status: 400 });
	}

	const [client, server] = Object.values(new WebSocketPair());
	await handleSession(server);

	return new Response(null, {
		status: 101,
		webSocket: client,
	});
}

export default {
	async fetch(req: Request) {
		try {
			const url = new URL(req.url);
			switch (url.pathname) {
				case '/':
					return template();
				case '/ws':
					return await websocketHandler(req);
				default:
					return new Response('Not found', { status: 404 });
			}
		} catch (err: unknown) {
			const e = err as Error;
			return new Response(e.toString());
		}
	},
};
