import assert from "node:assert";
import { DurableObject } from "cloudflare:workers";
import { CoreBindings } from "../core/constants";
import type { Fetcher } from "@cloudflare/workers-types/experimental";

interface Env {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	BrowserSession: DurableObjectNamespace<BrowserSession>;
}

function isClosed(ws: WebSocket | undefined): boolean {
	return !ws || ws.readyState === WebSocket.CLOSED;
}

export class BrowserSession extends DurableObject<Env> {
	endpoint?: string;
	ws?: WebSocket;
	server?: WebSocket;

	async fetch(_request: Request) {
		assert(
			this.endpoint !== undefined,
			"endpoint must be set before connecting"
		);

		// sometimes the websocket doesn't get the close event, so we need to close them explicitly if needed
		if (isClosed(this.ws) || isClosed(this.server)) {
			this.ws?.close();
			this.server?.close();
			this.ws = undefined;
			this.server = undefined;
		} else {
			assert.fail("WebSocket already initialized");
		}

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		server.accept();

		const wsEndpoint = this.endpoint.replace("ws://", "http://");

		const response = await fetch(wsEndpoint, {
			headers: {
				Upgrade: "websocket",
			},
		});

		assert(response.webSocket !== null, "Expected a WebSocket response");
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
			// both @cloudflare/puppeteer and @cloudflare/playwright send ping messges each second,
			// so we use them to check the status of the browser
			if (m.data === "ping") {
				this.#checkStatus().catch((err) => {
					console.error("Error checking browser status:", err);
				});
				return;
			}
			// HACK: TODO: Figure out what the chunking mechanism is in @cloudflare/puppeteer and unchunk the messages here, rather than just naively slicing off the header. This Worker should probably have the increase_websocket_message_size compat flag added
			ws.send(new TextDecoder().decode((m.data as ArrayBuffer).slice(4)));
		});
		server.addEventListener("close", ({ code, reason }) => {
			ws.close(code, reason);
			this.ws = undefined;
		});
		ws.addEventListener("close", ({ code, reason }) => {
			server.close(code, reason);
			this.server = undefined;
		});
		this.ws = ws;
		this.server = server;

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
	async setEndpoint(endpoint: string) {
		this.endpoint = endpoint;
	}

	async #checkStatus() {
		if (this.endpoint) {
			const url = new URL("http://example.com/browser/status");
			url.searchParams.set("wsEndpoint", this.endpoint);
			const resp = await this.env[CoreBindings.SERVICE_LOOPBACK].fetch(url);
			const { stopped } = resp.ok
				? ((await resp.json()) as { stopped: boolean })
				: {};

			if (stopped) {
				// Browser process has exited, we should close the WebSocket
				// TODO should we send a error code?
				this.ws?.close();
				this.server?.close();
				this.ws = undefined;
				this.server = undefined;
				this.ctx.storage.deleteAll();
				return;
			}
		}
	}
}

export default {
	async fetch(request: Request, env: Env) {
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
				assert(sessionId !== null, "browser_session must be set");
				const id = env.BrowserSession.idFromName(sessionId);
				return env.BrowserSession.get(id).fetch(request);
			}
			default:
				return new Response("Not implemented", { status: 405 });
		}
	},
};
