export async function getWorkerWSResponses(request: Request, env) {
	// test fetch requests (includes both assets and User Worker routes)
	const response = await env.WS.fetch(request);
	const fetchResponse = await response.text();

	// test fetch WS request
	// we could proxy through a end-user client request like we do in the other tests, but just to simplify testing WS, we'll just construct a fresh client here on the server
	const websocketResponse = await env.WS.fetch(
		new Request(request.url, { headers: { Upgrade: "websocket" } })
	);
	const ws = websocketResponse.webSocket as WebSocket;

	ws.accept();

	let makeData: (value: string) => void;
	const dataPromise = new Promise<string>((resolve) => {
		makeData = resolve;
	});
	const textDecoder = new TextDecoder();
	ws.addEventListener("message", (event) => {
		makeData(textDecoder.decode(event.data as ArrayBuffer));
		ws.close();
	});

	let makeClose: () => void;
	const closePromise = new Promise<void>((resolve) => {
		makeClose = resolve;
	});
	ws.addEventListener("close", makeClose);

	ws.send("hello from client");
	await closePromise;

	return {
		fetchResponse,
		fetchWSResponse: await dataPromise,
	};
}
