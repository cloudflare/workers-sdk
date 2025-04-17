import { RpcClient } from ".";

export default function (env: { SERVER: Fetcher; key: string }) {
	let ws: WebSocket | null = null;

	const client = new RpcClient(async (d) => {
		console.log("client -> server", d);
		if (!ws) {
			const result = await fetch("http://localhost:8787/" + env.key, {
				headers: { Upgrade: "websocket" },
			});
			console.log(result);
			ws = result.webSocket;
			ws?.accept();
		}
		console.log(ws?.readyState === WebSocket.READY_STATE_OPEN);
		ws?.addEventListener("message", (message) => {
			console.log("server -> client received");
			client.receive(message.data as string);
		});
		await ws?.send(d);
	});
	console.log(env.key);
	return client.createChainProxy();
}
