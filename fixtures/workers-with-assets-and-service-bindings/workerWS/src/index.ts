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

			// closing the server as we only ever expect to receive one
			// message from the client
			server.close();
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
