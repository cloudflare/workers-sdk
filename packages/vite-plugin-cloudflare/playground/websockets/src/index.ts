import html from "./index.html?raw";
import { DurableObject } from "cloudflare:workers";

interface Env {
	WEBSOCKET_SERVER: DurableObjectNamespace<WebSocketServer>;
}

export class WebSocketServer extends DurableObject {
	override fetch() {
		const { 0: client, 1: server } = new WebSocketPair();

		this.ctx.acceptWebSocket(server);

		return new Response(null, { status: 101, webSocket: client });
	}

	override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
		const decoder = new TextDecoder();
		const message = typeof data === "string" ? data : decoder.decode(data);

		ws.send(`Durable Object received client message: '${message}'.`);
	}
}

export default {
	async fetch(request, env) {
		if (request.url.endsWith("/websocket")) {
			const upgradeHeader = request.headers.get("Upgrade");

			if (!upgradeHeader || upgradeHeader !== "websocket") {
				return new Response("Durable Object expected Upgrade: websocket", {
					status: 426,
				});
			}

			const id = env.WEBSOCKET_SERVER.idFromName("id");
			const stub = env.WEBSOCKET_SERVER.get(id);

			return stub.fetch(request);
		}

		return new Response(html, { headers: { "content-type": "text/html" } });
	},
} satisfies ExportedHandler<Env>;
