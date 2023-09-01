// TODO: Inspector Durable Object
//  1. ~~Durable Object websocket server~~
//  2. JSON list endpoints (proxy through to workerd and filter for core:user:*)
//  3. ~~Receive cf data from proxy controller (use env.SECRET for auth)~~
//  4. ~~Connect to remote websocket and establish devtools connection~~
//  5. ~~Buffer messages from remote until we've got client connection~~
//  6. Intercept logging messages and log them to the console (probably via websocket to proxy controller)
//  7. Intercept/rewriting messages for source maps and stuff
//

import assert from "node:assert";
import type { ProxyData } from "../../src/api/startDevWorker/events";

interface Env {
	PROXY_CONTROLLER: Fetcher;
	PROXY_CONTROLLER_AUTH_SECRET: string;
}

// TODO: extract into shared library
type MaybePromise<T> = T | Promise<T>;
type DeferredPromise<T> = Promise<T> & {
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};
function createDeferredPromise<T>(): DeferredPromise<T> {
	let resolve, reject;
	const deferred = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	return Object.assign(deferred, {
		resolve,
		reject,
	} as unknown) as DeferredPromise<T>;
}

export default {
	fetch(req, env) {
		if (isRequestFromProxyController(req, env)) {
		}

		return new Response(null, { status: 404 });
	},
} as ExportedHandler<Env>;

export type InspectorProxyWorkerIncomingMessage = {
	type: "proxy-data";
	proxyData: ProxyData;
};
export type InspectorProxyWorkerOutgoingMessage = never;

export class InspectorProxy implements DurableObject {
	constructor(_state: DurableObjectState, readonly env: Env) {}

	#proxyController?: WebSocket;
	#proxyData?: ProxyData;

	runtimeMessageBuffer: string[] = [];

	// TODO: if we don't need `this`, lift out into module level functions
	#transformRuntimeToDevToolsMessage(data: string): string {
		const message = JSON.parse(data);

		return JSON.stringify(message);
	}
	#transformDevToolsToRuntimeMesssage(data: string): string {
		const message = JSON.parse(data);

		return JSON.stringify(message);
	}

	#handleRuntimeIncomingMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");
		// TODO:
		//  - If console log, then log via proxy controller
		if (this.#devtoolsWebSocket?.readyState !== WebSocket.READY_STATE_OPEN) {
			this.runtimeMessageBuffer.push(event.data);
		} else {
			this.#devtoolsWebSocket.send(
				this.#transformRuntimeToDevToolsMessage(event.data)
			);
		}
	};

	#runtimeWebSocket?: WebSocket;
	#runtimeWebSocketPromise = createDeferredPromise<void>();

	#handleProxyControllerIncomingMessage = async (event: MessageEvent) => {
		assert(typeof event.data === "string");

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

			// use `await fetch()` over `new WebSocket()` to avoid WebSocket.READY_STATE_CONNECTING state
			const url = new URL(this.#proxyData.destinationInspectorURL);
			url.protocol = url.protocol === "wss:" ? "https:" : "http:";
			const res = await fetch(url, { headers: { Upgrade: "websocket" } });
			const runtime = res.webSocket;
			assert(runtime !== null);

			runtime.addEventListener("message", this.#handleRuntimeIncomingMessage);
			runtime.accept();
			this.#runtimeWebSocket?.close();
			this.#runtimeWebSocket = runtime;
			this.#runtimeWebSocketPromise.resolve();
			// TODO: handle error and close events
		}
	};

	#handleProxyControllerDataRequest(req: Request) {
		assert(req.headers.get("Upgrade") === "websocket");
		const { 0: response, 1: proxyController } = new WebSocketPair();
		proxyController.accept();
		proxyController.addEventListener(
			"message",
			this.#handleProxyControllerIncomingMessage
		);
		this.#proxyController = proxyController;
		return new Response(null, {
			status: 101,
			webSocket: response,
		});
	}

	#handleJsonRequest(req: Request) {
		const url = new URL(req.url);
		if (url.pathname === "/json/version") {
			// TODO:
		} else if (url.pathname === "/json" || url.pathname === "/json/list") {
		}
		return new Response(null, { status: 404 });
	}

	// -----
	#devtoolsWebSocket?: WebSocket;

	#handleDevToolsIncomingMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");
		this.#runtimeWebSocket?.send(
			this.#transformDevToolsToRuntimeMesssage(event.data)
		);
	};

	async #handleWebSocketUpgradeRequest(req: Request) {
		// DevTools connected
		await this.#runtimeWebSocketPromise;

		assert(req.headers.get("Upgrade") === "websocket");
		const { 0: response, 1: devtools } = new WebSocketPair();

		devtools.accept();
		if (this.#devtoolsWebSocket !== undefined) {
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
			for (const message of this.runtimeMessageBuffer) {
				devtools.send(this.#transformRuntimeToDevToolsMessage(message));
			}
			this.runtimeMessageBuffer.length = 0;

			this.#devtoolsWebSocket = devtools;
		}

		return new Response(null, {
			status: 101,
			webSocket: response,
		});
	}

	async fetch(req: Request) {
		if (isRequestFromProxyController(req, this.env)) {
			return this.#handleProxyControllerDataRequest(req);
		} else if (req.headers.get("Upgrade") === "websocket") {
			return this.#handleWebSocketUpgradeRequest(req);
		} else {
			return this.#handleJsonRequest(req);
		}
	}
}

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
