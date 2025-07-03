import assert from "node:assert";
import { DurableObject } from "cloudflare:workers";
import { CoreBindings } from "../core/constants";
import type { Fetcher } from "@cloudflare/workers-types/experimental";

export class BrowserSession extends DurableObject {
	endpoint: string | undefined;
	async fetch(_request: Request) {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		server.accept();
		assert(this.endpoint !== undefined);

		const response = await fetch(this.endpoint, {
			headers: {
				Upgrade: "websocket",
			},
		});

		assert(response.webSocket !== null);
		const ws = response.webSocket;

		ws.accept();

		ws.addEventListener("message", (m) => {
			// HACK: TODO: Figure out what the chunking mechanism is in @cloudflare/puppeteer and re-chunk the messages here, rather than just naively slicing off the header. This Worker should probably have the increase_websocket_message_size compat flag added
			const string = new TextEncoder().encode(m.data as string);
			const data = new Uint8Array(string.length + 4);

			const view = new DataView(data.buffer);
			view.setUint32(0, string.length, true);
			data.set(string, 4);

			server.send(data);
		});

		server.addEventListener("message", (m) => {
			if (m.data === "ping") return;
			// HACK: TODO: Figure out what the chunking mechanism is in @cloudflare/puppeteer and unchunk the messages here, rather than just naively slicing off the header. This Worker should probably have the increase_websocket_message_size compat flag added
			ws.send(new TextDecoder().decode((m.data as ArrayBuffer).slice(4)));
		});
		// server.addEventListener("close", () => console.log("client closed"));
		// ws.addEventListener("close", () => console.log("ws closed"));

		// server.addEventListener("error", () => console.log("client error"));
		// ws.addEventListener("error", () => console.log("ws error"));

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
	async setEndpoint(endpoint: string) {
		this.endpoint = endpoint.replace("ws://", "http://");
	}
}

export default {
	async fetch(
		request: Request,
		env: {
			[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
			BrowserSession: DurableObjectNamespace<BrowserSession>;
		}
	) {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/v1/acquire": {
				const resp = await env[CoreBindings.SERVICE_LOOPBACK].fetch(
					"http://example.com/browser/launch"
				);
				const wsEndpoint = await resp.text();
				const sessionId = crypto.randomUUID();
				const id = env.BrowserSession.idFromName(sessionId);
				await env.BrowserSession.get(id).setEndpoint(wsEndpoint);
				return Response.json({ sessionId });
			}
			case "/v1/connectDevtools": {
				const sessionId = url.searchParams.get("browser_session");
				assert(sessionId !== null);
				const id = env.BrowserSession.idFromName(sessionId);
				return env.BrowserSession.get(id).fetch(request);
			}
			default:
				return new Response("Not implemented", { status: 405 });
		}
	},
};
