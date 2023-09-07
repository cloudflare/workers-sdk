// TODO: Inspector Durable Object
//  1. ~~Durable Object websocket server~~
//  2. ~~JSON list endpoints (proxy through to workerd and filter for core:user:*)~~
//  3. ~~Receive cf data from proxy controller (use env.SECRET for auth)~~
//  4. ~~Connect to remote websocket and establish devtools connection~~
//  5. ~~Buffer messages from remote until we've got client connection~~
//  6. ~~Intercept logging messages and log them to the console (probably via websocket to proxy controller)~~
//  7. Rewriting messages for source maps and stuff
//

/**
 * TODO:
 *
 * - Rewriting messages for source maps and stuff
 *      -
 * - tests
 *      - test devtools get-source-map triggers service binding callback?
 *      -
 */

import assert from "node:assert";
import {
	castErrorCause,
	DevToolsCommandRequest,
	DevToolsCommandRequests,
	DevToolsCommandResponse,
	DevToolsCommandResponses,
	DevToolsEvent,
	DevToolsEvents,
	type InspectorProxyWorkerIncomingWebSocketMessage,
	type InspectorProxyWorkerOutgoingRequestBody,
	type InspectorProxyWorkerOutgoingWebsocketMessage,
	type ProxyData,
} from "../../src/api/startDevWorker/events";
import {
	MaybePromise,
	assertNever,
	createDeferredPromise,
} from "../../src/api/startDevWorker/utils";
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

export class InspectorProxyWorker implements DurableObject {
	constructor(_state: DurableObjectState, readonly env: Env) {}

	#websockets: {
		proxyController?: WebSocket;
		runtime?: WebSocket;
		devtools?: WebSocket;
	} = {};
	#runtimeWebSocketPromise = createDeferredPromise<WebSocket>();

	#proxyData?: ProxyData;

	runtimeMessageBuffer: string[] = [];

	// latestExecutionContextCreatedMessage:
	// 	| DevToolsEvent<"Runtime.executionContextCreated">
	// 	| undefined;
	// executionContextId = 0;
	// getScriptSourceMessages: DevToolsCommandResponse<"Debugger.getScriptSource">[] =
	// 	[];
	#handleRuntimeIncomingMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");
		assert(
			this.#websockets.proxyController !== undefined,
			"Expected proxy controller websocket"
		);

		const msg = JSON.parse(event.data) as
			| DevToolsCommandResponses
			| DevToolsEvents;
		console.log("RUNTIME INCOMING MESSAGE", msg);

		if (
			"method" in msg &&
			(msg.method === "Runtime.exceptionThrown" ||
				msg.method === "Runtime.consoleAPICalled")
		) {
			this.sendProxyControllerMessage(event.data);
		}

		this.runtimeMessageBuffer.push(JSON.stringify(msg));

		this.#tryDrainRuntimeMessageBuffer();
	};

	#tryDrainRuntimeMessageBuffer = () => {
		if (this.#websockets.devtools === undefined) return;

		// clear the buffer and replay each message to devtools
		for (const data of this.runtimeMessageBuffer.splice(0)) {
			this.sendDevToolsMessage(data);
		}
	};

	#runtimeMessageCounter = 1e8;
	nextCounter() {
		return ++this.#runtimeMessageCounter;
	}
	keepAliveInterval: number | null = null;
	#handleProxyControllerIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected event.data from proxy controller to be string"
		);

		const message: InspectorProxyWorkerIncomingWebSocketMessage = JSON.parse(
			event.data
		);

		console.log("handleProxyControllerIncomingMessage", event.data);

		switch (message.type) {
			case "reloadComplete":
				this.#proxyData = message.proxyData;

				this.reconnectRuntimeWebSocket();
				this.notifyDevToolsOfReloadComplete();

				break;
			default:
				assertNever(message.type);
		}
	};
	notifyDevToolsOfReloadComplete() {
		// // If devtools already has sources loaded, they may now be stale
		// // TODO: figure out how to get devtools to reload
		// this.#websockets.devtools?.close();
		//
		// this.sendDevToolsMessage({
		// 	method: "Runtime.executionContextDestroyed",
		// 	params: {
		// 		executionContextId: 1,
		// 		executionContextUniqueId:
		// 			this.latestExecutionContextCreatedMessage.context
		// 				.executionContextUniqueId,
		// 	},
		// });
		//
		// this.sendRuntimeMessage({
		// 	method: "Runtime.enable",
		// 	id: this.nextCounter(),
		// });
	}

	reconnectRuntimeWebSocket() {
		assert(this.#proxyData);

		console.log("reconnectRuntimeWebSocket");

		const deferred = createDeferredPromise<WebSocket>();

		// resolve with a promise so anything await-ing the old promise is now await-ing the new promise
		this.#runtimeWebSocketPromise.resolve(deferred);
		// if `#runtimeWebSocketPromise` was already resolved, .resolve() has no effect, so set the new promise for any new await-ers
		this.#runtimeWebSocketPromise = deferred;

		console.log("BEFORE new Websocket");
		const runtime = new WebSocket(this.#proxyData.destinationInspectorURL);
		console.log("AFTER new Websocket");

		this.#websockets.runtime?.close();
		this.#websockets.runtime = runtime;

		runtime.addEventListener("message", this.#handleRuntimeIncomingMessage);

		runtime.addEventListener("close", (event) => {
			console.error("RUNTIME WEBSOCKET CLOSED", event.code, event.reason);

			// don't reconnect the runtime websocket
			// if it closes unexpectedly (very rare or a case where reconnecting won't succeed anyway)
			// wait for a new proxy-data message or manual restart

			clearInterval(this.keepAliveInterval);

			if (this.#websockets.runtime === runtime) {
				this.#websockets.runtime = undefined;
			}

			// this.sendDevToolsMessage({
			// 	method: "Runtime.executionContextDestroyed",
			// 	params: {
			// 		executionContextId: 1,
			// 		// @ts-expect-error DevTools Protocol type is wrong -- this property exists!
			// 		executionContextUniqueId:
			// 			this.latestExecutionContextCreatedMessage?.params.context?.uniqueId,
			// 	},
			// });
		});

		runtime.addEventListener("error", (event) => {
			console.error("RUNTIME WEBSOCKET ERROR", event.message, event.error);
			clearInterval(this.keepAliveInterval);

			if (this.#websockets.runtime === runtime) {
				this.#websockets.runtime = undefined;
			}

			this.sendProxyControllerRequest({
				type: "error",
				error: {
					name: "runtime websocket error",
					message: event.message,
					cause: event.error,
				},
			});
		});

		runtime.addEventListener("open", () => {
			console.log("RUNTIME WEBSOCKET OPENED");

			this.sendRuntimeMessage(
				{ method: "Runtime.enable", id: this.nextCounter() },
				runtime
			);
			this.sendRuntimeMessage(
				{ method: "Debugger.enable", id: this.nextCounter() },
				runtime
			);
			this.sendRuntimeMessage(
				{ method: "Network.enable", id: this.nextCounter() },
				runtime
			);

			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = setInterval(() => {
				this.sendRuntimeMessage(
					{ method: "Runtime.getIsolateId", id: this.nextCounter() },
					runtime
				);
			}, 10_000) as any;

			deferred.resolve(runtime);
		});
	}

	#handleProxyControllerRequest(req: Request) {
		assert(
			req.headers.get("Upgrade") === "websocket",
			"Expected proxy controller data request to be WebSocket upgrade"
		);

		const { 0: response, 1: proxyController } = new WebSocketPair();
		proxyController.accept();
		proxyController.addEventListener("close", () => {
			// don't reconnect the proxyController websocket
			// ProxyController can detect this event and reconnect itself

			if (this.#websockets.proxyController === proxyController) {
				this.#websockets.proxyController = undefined;
			}
		});
		proxyController.addEventListener("error", (event) => {
			// don't reconnect the proxyController websocket
			// ProxyController can detect this event and reconnect itself

			if (this.#websockets.proxyController === proxyController) {
				this.#websockets.proxyController = undefined;
			}

			this.sendProxyControllerRequest({
				type: "error",
				error: {
					name: "ProxyController websocket error",
					message: event.message,
					cause: event.error,
				},
			});
		});
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

	sendProxyControllerMessage(
		message: string | InspectorProxyWorkerOutgoingWebsocketMessage
	) {
		assert(this.#websockets.proxyController);

		message = typeof message === "string" ? message : JSON.stringify(message);

		this.#websockets.proxyController.send(message);
	}
	async sendProxyControllerRequest(
		message: InspectorProxyWorkerOutgoingRequestBody
	) {
		const res = await this.env.PROXY_CONTROLLER.fetch("http://dummy", {
			body: JSON.stringify(message),
		});

		return res.text();
	}
	async sendRuntimeMessage(
		message: string | DevToolsCommandRequests,
		runtime: MaybePromise<WebSocket> = this.#runtimeWebSocketPromise
	) {
		runtime = await runtime;
		message = typeof message === "string" ? message : JSON.stringify(message);

		console.log("SEND TO RUNTIME", message);

		runtime.send(message);
	}
	sendDevToolsMessage(
		message: string | DevToolsCommandResponses | DevToolsEvents
	) {
		message = typeof message === "string" ? message : JSON.stringify(message);

		console.log("SEND TO DEVTOOLS", message);

		this.#websockets.devtools?.send(message);
	}

	#inspectorId = crypto.randomUUID();
	async #handleDevToolsJsonRequest(req: Request) {
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

	#handleDevToolsIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected devtools incoming message to be of type string"
		);

		const message = JSON.parse(event.data) as DevToolsCommandRequests;
		console.log("DEVTOOLS INCOMING MESSAGE", message);

		if (message.method === "Network.loadNetworkResource") {
			return void this.handleDevToolsGetSourceMapMessage(message);
		}

		this.sendRuntimeMessage(JSON.stringify(message));
	};
	async handleDevToolsGetSourceMapMessage(
		message: DevToolsCommandRequest<"Network.loadNetworkResource">
	) {
		try {
			const sourcemap = await this.sendProxyControllerRequest({
				type: "get-source-map",
			});

			// this.#websockets.devtools can be undefined here
			// the incoming message implies we have a devtools connection, but after the await it could've dropped
			// in which case we can safely not respond
			this.sendDevToolsMessage({
				id: message.id,
				// @ts-expect-error DevTools Protocol type is wrong -- result.resource.text property exists!
				result: { resource: { success: true, text: sourcemap } },
			});
		} catch {
			this.sendRuntimeMessage(JSON.stringify(message));
		}
	}

	async #handleDevToolsWebSocketUpgradeRequest(req: Request) {
		// DevTools attempting to connect
		console.log("DEVTOOLS WEBCOCKET TRYING TO CONNECT");

		// Delay devtools connection response until we've connected to the runtime inspector server
		await this.#runtimeWebSocketPromise;

		console.log("DEVTOOLS WEBCOCKET CAN NOW CONNECT");

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
			devtools.addEventListener("message", this.#handleDevToolsIncomingMessage);
			devtools.addEventListener("close", () => {
				if (this.#websockets.devtools === devtools) {
					this.#websockets.devtools = undefined;
				}
			});
			devtools.addEventListener("error", (event) => {
				if (this.#websockets.devtools === devtools) {
					this.#websockets.devtools = undefined;
				}

				this.sendProxyControllerRequest({
					type: "error",
					error: {
						name: "DevTools websocket error",
						message: event.message,
						cause: event.error,
					},
				});
			});

			// Since Wrangler proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
			// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
			// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
			// The key initialisation messages that are needed are the `Debugger.scriptParsed events`.
			this.sendRuntimeMessage({
				id: this.nextCounter(),
				method: "Debugger.disable",
			});

			console.log("DEVTOOLS WEBCOCKET CONNECTED");

			this.#websockets.devtools = devtools;
			this.#tryDrainRuntimeMessageBuffer();
		}

		return new Response(null, { status: 101, webSocket: response });
	}

	async fetch(req: Request) {
		if (isRequestFromProxyController(req, this.env)) {
			return this.#handleProxyControllerRequest(req);
		}

		if (req.headers.get("Upgrade") === "websocket") {
			return this.#handleDevToolsWebSocketUpgradeRequest(req);
		}

		return this.#handleDevToolsJsonRequest(req);
	}
}

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
