// TODO: Inspector Durable Object
//  1. ~~Durable Object websocket server~~
//  2. ~~JSON list endpoints (proxy through to workerd and filter for core:user:*)~~
//  3. ~~Receive cf data from proxy controller (use env.SECRET for auth)~~
//  4. ~~Connect to remote websocket and establish devtools connection~~
//  5. ~~Buffer messages from remote until we've got client connection~~
//  6. ~~Intercept logging messages and log them to the console (probably via websocket to proxy controller)~~
//  7. Rewriting messages for source maps and stuff
//

import assert from "node:assert";
import type { ProxyData } from "../../src/api/startDevWorker/events";
import { createDeferredPromise } from "../../src/api/startDevWorker/utils";
import type Protocol from "devtools-protocol";

interface Env {
	PROXY_CONTROLLER: Fetcher;
	PROXY_CONTROLLER_AUTH_SECRET: string;
	WRANGLER_VERSION: string;
	DURABLE_OBJECT: DurableObjectNamespace;
}

export default {
	fetch(req, env) {
		const singleton = env.DURABLE_OBJECT.idFromName("");
		const inspectorProxy = env.DURABLE_OBJECT.get(singleton);

		return inspectorProxy.fetch(req);
	},
} as ExportedHandler<Env>;

export type InspectorProxyWorkerIncomingMessage = {
	type: "proxy-data";
	proxyData: ProxyData;
};
export type InspectorProxyWorkerOutgoingMessage = never;

export class InspectorProxyWorker implements DurableObject {
	constructor(_state: DurableObjectState, readonly env: Env) {}

	#websockets: {
		proxyController?: WebSocket;
		runtime?: WebSocket;
		devtools?: WebSocket;
	} = {};
	#runtimeWebSocketPromise = createDeferredPromise<void>();

	#proxyData?: ProxyData;

	runtimeMessageBuffer: string[] = [];

	// TODO: if we don't need `this`, lift out into module level functions
	#transformRuntimeToDevToolsMessage(data: string): string {
		const message = JSON.parse(data);

		// TODO: transform message

		return JSON.stringify(message);
	}
	#transformDevToolsToRuntimeMesssage(data: string): string {
		const message = JSON.parse(data);

		// TODO: transform message

		return JSON.stringify(message);
	}

	#handleRuntimeIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected event.data from runtime to be string"
		);

		const msg = JSON.parse(event.data) as { method: string };
		console.log({ msg });

		if (
			msg.method === "Runtime.exceptionThrown" ||
			msg.method === "Runtime.consoleAPICalled"
		) {
			this.#websockets.proxyController?.send(event.data);
		}

		this.runtimeMessageBuffer.push(event.data);

		this.#processRuntimeMessageBuffer();
	};

	#processRuntimeMessageBuffer = () => {
		if (this.#websockets.devtools === undefined) return;

		console.log("runtimeMessageBuffer", this.runtimeMessageBuffer);

		for (const data of this.runtimeMessageBuffer) {
			this.#websockets.devtools.send(
				this.#transformRuntimeToDevToolsMessage(data)
			);
		}

		// this.runtimeMessageBuffer.length = 0;
	};

	#runtimeMessageCounter = 0;
	getNextRuntimeMessageCounter() {
		return ++this.#runtimeMessageCounter;
	}
	keepAliveInterval: number | null = null;
	#handleProxyControllerIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected event.data from proxy controller to be string"
		);

		const message: InspectorProxyWorkerIncomingMessage = JSON.parse(event.data);

		if (message.type === "proxy-data") {
			if (
				this.#proxyData?.destinationInspectorURL ===
				message.proxyData.destinationInspectorURL
			) {
				return;
			}

			// connect or reconnect to runtime inspector server
			this.#proxyData = message.proxyData;

			// // use `await fetch()` over `new WebSocket()` to avoid WebSocket.READY_STATE_CONNECTING state
			const url = new URL(this.#proxyData.destinationInspectorURL);
			url.protocol = url.protocol === "wss:" ? "https:" : "http:";

			void fetch(url, { headers: { Upgrade: "websocket" } })
				.then((res) => {
					assert(
						res.status === 101,
						`Expected response status 101, got ${res.status}`
					);
					const runtime = res.webSocket;
					assert(runtime !== null, "Expected runtime WebSocket not to be null");

					runtime.addEventListener(
						"message",
						this.#handleRuntimeIncomingMessage
					);
					runtime.accept();
					runtime.send(
						JSON.stringify({
							method: "Runtime.enable",
							id: this.getNextRuntimeMessageCounter(),
						})
					);
					// TODO: This doesn't actually work. Must fix.
					runtime.send(
						JSON.stringify({
							method: "Network.enable",
							id: this.getNextRuntimeMessageCounter(),
						})
					);

					clearInterval(this.keepAliveInterval);
					this.keepAliveInterval = setInterval(() => {
						runtime.send(
							JSON.stringify({
								method: "Runtime.getIsolateId",
								id: this.getNextRuntimeMessageCounter(),
							})
						);
					}, 10_000) as any;
					this.#websockets.runtime?.close();
					this.#websockets.runtime = runtime;
					this.#runtimeWebSocketPromise.resolve();
					// this.#processRuntimeMessageBuffer();
					// TODO: handle error and close events
				})
				.catch(console.error);
		}
	};

	#handleProxyControllerDataRequest(req: Request) {
		assert(
			req.headers.get("Upgrade") === "websocket",
			"Expected proxy controller data request to be WebSocket upgrade"
		);
		const { 0: response, 1: proxyController } = new WebSocketPair();
		proxyController.accept();
		proxyController.addEventListener(
			"message",
			this.#handleProxyControllerIncomingMessage
		);

		this.#websockets.proxyController = proxyController;

		return new Response(null, {
			status: 101,
			webSocket: response,
		});
	}

	#inspectorId = crypto.randomUUID();
	async #handleJsonRequest(req: Request) {
		await this.#runtimeWebSocketPromise;
		assert(this.#proxyData);

		const url = new URL(req.url);

		if (url.pathname === "/json/version") {
			return Response.json({
				Browser: `wrangler/v${this.env.WRANGLER_VERSION}`,
				// TODO: (someday): The DevTools protocol should match that of Edge Worker.
				// This could be exposed by the preview API.
				"Protocol-Version": "1.3",
			});
		}

		if (url.pathname === "/json" || url.pathname === "/json/list") {
			// TODO: can we remove the `/ws` here if we only have a single worker?
			const localHost = `${url.host}/ws`;
			const devtoolsFrontendUrl = `https://devtools.devprod.cloudflare.dev/js_app?theme=systemPreferred&debugger=true&ws=${localHost}`;

			return Response.json([
				{
					id: this.#inspectorId,
					type: "node", // TODO: can we specify different type?
					description: "workers",
					webSocketDebuggerUrl: `ws://${localHost}`,
					devtoolsFrontendUrl,
					devtoolsFrontendUrlCompat: devtoolsFrontendUrl,
					// Below are fields that are visible in the DevTools UI.
					title: "Cloudflare Worker",
					faviconUrl: "https://workers.cloudflare.com/favicon.ico",
					// url: "http://" + localHost, // looks unnecessary
				},
			]);
		}

		return new Response(null, { status: 404 });
	}

	// -----

	#handleDevToolsIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected devtools incoming message to be of type string"
		);
		assert(
			this.#websockets.runtime,
			"Cannot proxy devtools incoming message to undefined this.#websockets.runtime"
		);

		this.#websockets.runtime.send(
			this.#transformDevToolsToRuntimeMesssage(event.data)
		);
	};

	async #handleWebSocketUpgradeRequest(req: Request) {
		// DevTools attempting to connect

		// Delay devtools connection response until we've connected to the runtime inspector server
		await this.#runtimeWebSocketPromise;

		assert(
			req.headers.get("Upgrade") === "websocket",
			"Expected DevTools connection to be WebSocket upgrade"
		);
		const { 0: response, 1: devtools } = new WebSocketPair();
		devtools.accept();

		if (this.#websockets.devtools !== undefined) {
			/** We only want to have one active Devtools instance at a time. */
			// TODO(consider): prioritise new websocket over previous
			devtools.close(
				1013,
				"Too many clients; only one can be connected at a time"
			);
		} else {
			// TODO: remoteWebSocket.send 100_000_000 Debugger.disable thing
			devtools.addEventListener("message", this.#handleDevToolsIncomingMessage);

			// Send buffered messages

			this.#websockets.devtools = devtools;
			this.#processRuntimeMessageBuffer();
		}

		return new Response(null, { status: 101, webSocket: response });
	}

	async fetch(req: Request) {
		if (isRequestFromProxyController(req, this.env)) {
			return this.#handleProxyControllerDataRequest(req);
		}

		if (req.headers.get("Upgrade") === "websocket") {
			return this.#handleWebSocketUpgradeRequest(req);
		}

		return this.#handleJsonRequest(req);
	}
}

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
