import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	fetch(req: Request) {
		if (!req.headers.get("Upgrade")?.includes("websocket")) {
			return new Response("Hello from worker-ws fetch()");
		}

		const [server, client] = Object.values(new WebSocketPair());

		server.accept();

		const textEncoder = new TextEncoder();
		server.addEventListener("message", (event) => {
			server.send(textEncoder.encode(`pong: ${event.data}`));
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
