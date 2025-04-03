export async function getWorkerWSResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.WS.fetch(request);
	const fetchResponse = await response.text();

	// test fetch WS request
	// Make a fetch request including `Upgrade: websocket` header. This
	// indicates to the runtime that we are trying to establish a
	// WebSocket connection
	const websocketResponse: Response = await env.WS.fetch(
		new Request(request.url, { headers: { Upgrade: "websocket" } })
	);

	// If the WebSocket handshake completed successfully, then the
	// response has a `webSocket` property.
	// If `webSocket` is null this was most probably a static asset route
	// that hit the Asset Worker and not the User Worker
	const ws = websocketResponse.webSocket;

	// Call accept() to indicate that we'll be handling the socket here
	ws?.accept();

	// Send messages to the WebSocket server
	ws?.send("hello from client");

	// Receive messages from the WebSocket server
	ws?.addEventListener("message", (event) => {
		const textDecoder = new TextDecoder();
		console.log(textDecoder.decode(event.data as ArrayBuffer));
		ws.close();
	});

	return {
		fetchResponse,
	};
}
