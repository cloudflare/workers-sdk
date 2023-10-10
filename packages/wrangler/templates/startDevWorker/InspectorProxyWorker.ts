import assert from "node:assert";
import {
	DevToolsCommandRequest,
	DevToolsCommandRequests,
	DevToolsCommandResponses,
	DevToolsEvent,
	DevToolsEvents,
	type InspectorProxyWorkerIncomingWebSocketMessage,
	type InspectorProxyWorkerOutgoingRequestBody,
	type InspectorProxyWorkerOutgoingWebsocketMessage,
	type ProxyData,
	serialiseError,
} from "../../src/api/startDevWorker/events";
import {
	assertNever,
	createDeferred,
	MaybePromise,
	urlFromParts,
} from "../../src/api/startDevWorker/utils";

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

function isDevToolsEvent<Method extends DevToolsEvents["method"]>(
	event: unknown,
	name: Method
): event is DevToolsEvent<Method> {
	return (
		typeof event === "object" &&
		event !== null &&
		"method" in event &&
		event.method === name
	);
}

export class InspectorProxyWorker implements DurableObject {
	constructor(_state: DurableObjectState, readonly env: Env) {}

	#websockets: {
		proxyController?: WebSocket;
		runtime?: WebSocket;
		devtools?: WebSocket;
		// Browser DevTools cannot read the filesystem, instead they fetch via
		// `Network.loadNetworkResource` messages.
		// IDE DevTools can read the filesystem and expect absolute paths.
		devtoolsHasFileSystemAccess?: boolean;
	} = {};
	#runtimeWebSocketDeferred = createDeferred<WebSocket>();

	#proxyData?: ProxyData;

	runtimeMessageBuffer: (DevToolsCommandResponses | DevToolsEvents)[] = [];

	#handleRuntimeIncomingMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");

		const msg = JSON.parse(event.data) as
			| DevToolsCommandResponses
			| DevToolsEvents;
		this.sendDebugLog("RUNTIME INCOMING MESSAGE", msg);

		if (
			isDevToolsEvent(msg, "Runtime.exceptionThrown") ||
			isDevToolsEvent(msg, "Runtime.consoleAPICalled")
		) {
			this.sendProxyControllerMessage(event.data);
		}

		this.runtimeMessageBuffer.push(msg);
		this.#tryDrainRuntimeMessageBuffer();
	};

	#handleRuntimeScriptParsed(msg: DevToolsEvent<"Debugger.scriptParsed">) {
		if (
			!this.#websockets.devtoolsHasFileSystemAccess &&
			msg.params.sourceMapURL !== undefined
		) {
			const url = new URL(msg.params.sourceMapURL, msg.params.url);
			if (url.protocol === "file:") {
				msg.params.sourceMapURL = url.href.replace("file:", "wrangler-file:");
			}
		}

		void this.sendDevToolsMessage(msg);
	}

	#tryDrainRuntimeMessageBuffer = () => {
		// If we don't have a DevTools WebSocket, try again later
		if (this.#websockets.devtools === undefined) return;

		// clear the buffer and replay each message to devtools
		for (const msg of this.runtimeMessageBuffer.splice(0)) {
			if (isDevToolsEvent(msg, "Debugger.scriptParsed")) {
				this.#handleRuntimeScriptParsed(msg);
			} else {
				void this.sendDevToolsMessage(msg);
			}
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

		this.sendDebugLog("handleProxyControllerIncomingMessage", event.data);

		switch (message.type) {
			case "reloadComplete":
				this.#proxyData = message.proxyData;

				this.reconnectRuntimeWebSocket();

				break;
			default:
				assertNever(message.type);
		}
	};

	reconnectRuntimeWebSocket() {
		assert(this.#proxyData, "Expected this.#proxyData to be defined");

		this.sendDebugLog("reconnectRuntimeWebSocket");

		this.#runtimeWebSocketDeferred = createDeferred<WebSocket>(
			this.#runtimeWebSocketDeferred
		);

		this.sendDebugLog("BEFORE new Websocket");
		const runtime = new WebSocket(
			urlFromParts(this.#proxyData.userWorkerInspectorUrl).href
		);
		this.sendDebugLog("AFTER new Websocket");

		this.#websockets.runtime?.close();
		this.#websockets.runtime = runtime;

		runtime.addEventListener("message", this.#handleRuntimeIncomingMessage);

		runtime.addEventListener("close", (event) => {
			this.sendDebugLog("RUNTIME WEBSOCKET CLOSED", event.code, event.reason);

			// don't reconnect the runtime websocket
			// if it closes unexpectedly (very rare or a case where reconnecting won't succeed anyway)
			// wait for a new proxy-data message or manual restart

			clearInterval(this.keepAliveInterval);

			if (this.#websockets.runtime === runtime) {
				this.#websockets.runtime = undefined;
			}
		});

		runtime.addEventListener("error", (event) => {
			clearInterval(this.keepAliveInterval);

			if (this.#websockets.runtime === runtime) {
				this.#websockets.runtime = undefined;
			}

			this.sendProxyControllerRequest({
				type: "runtime-websocket-error",
				error: {
					message: event.message,
					cause: event.error,
				},
			});

			this.reconnectRuntimeWebSocket();
		});

		runtime.addEventListener("open", () => {
			this.sendDebugLog("RUNTIME WEBSOCKET OPENED");

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

			this.#runtimeWebSocketDeferred.resolve(runtime);
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
		proxyController.addEventListener("error", () => {
			// don't reconnect the proxyController websocket
			// ProxyController can detect this event and reconnect itself

			if (this.#websockets.proxyController === proxyController) {
				this.#websockets.proxyController = undefined;
			}
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
		message = typeof message === "string" ? message : JSON.stringify(message);

		// if the proxyController websocket is disconnected, throw away the message
		this.#websockets.proxyController?.send(message);
	}
	async sendProxyControllerRequest(
		message: InspectorProxyWorkerOutgoingRequestBody
	) {
		try {
			const res = await this.env.PROXY_CONTROLLER.fetch("http://dummy", {
				method: "POST",
				body: JSON.stringify(message),
			});
			return res.ok ? await res.text() : undefined;
		} catch (e) {
			this.sendDebugLog(
				"FAILED TO SEND PROXY CONTROLLER REQUEST",
				serialiseError(e)
			);
			return undefined;
		}
	}
	async sendRuntimeMessage(
		message: string | DevToolsCommandRequests,
		runtime: MaybePromise<WebSocket> = this.#runtimeWebSocketDeferred.promise
	) {
		runtime = await runtime;
		message = typeof message === "string" ? message : JSON.stringify(message);

		this.sendDebugLog("SEND TO RUNTIME", message);

		runtime.send(message);
	}
	sendDevToolsMessage(
		message: string | DevToolsCommandResponses | DevToolsEvents
	) {
		message = typeof message === "string" ? message : JSON.stringify(message);

		this.sendDebugLog("SEND TO DEVTOOLS", message);

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
		this.sendDebugLog("DEVTOOLS INCOMING MESSAGE", message);

		if (message.method === "Network.loadNetworkResource") {
			return void this.handleDevToolsLoadNetworkResource(message);
		}

		this.sendRuntimeMessage(JSON.stringify(message));
	};
	async handleDevToolsLoadNetworkResource(
		message: DevToolsCommandRequest<"Network.loadNetworkResource">
	) {
		const response = await this.sendProxyControllerRequest({
			type: "load-network-resource",
			url: message.params.url,
		});
		if (response === undefined) {
			this.sendRuntimeMessage(JSON.stringify(message));
		} else {
			// this.#websockets.devtools can be undefined here
			// the incoming message implies we have a devtools connection, but after
			// the await it could've dropped in which case we can safely not respond
			this.sendDevToolsMessage({
				id: message.id,
				// @ts-expect-error DevTools Protocol type is wrong -- result.resource.text property exists!
				result: { resource: { success: true, text: response } },
			});
		}
	}

	async #handleDevToolsWebSocketUpgradeRequest(req: Request) {
		// DevTools attempting to connect
		this.sendDebugLog("DEVTOOLS WEBCOCKET TRYING TO CONNECT");

		// Delay devtools connection response until we've connected to the runtime inspector server
		await this.#runtimeWebSocketDeferred.promise;

		this.sendDebugLog("DEVTOOLS WEBCOCKET CAN NOW CONNECT");

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
			});

			// Since Wrangler proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
			// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
			// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
			// The key initialisation messages that are needed are the `Debugger.scriptParsed events`.
			this.sendRuntimeMessage({
				id: this.nextCounter(),
				method: "Debugger.disable",
			});

			this.sendDebugLog("DEVTOOLS WEBCOCKET CONNECTED");

			// Our patched DevTools are hosted on a `https://` URL. These cannot
			// access `file://` URLs, meaning local source maps cannot be fetched.
			// To get around this, we can rewrite `Debugger.scriptParsed` events to
			// include a special `worker:` scheme for source maps, and respond to
			// `Network.loadNetworkResource` commands for these. Unfortunately, this
			// breaks IDE's built-in debuggers (e.g. VSCode and WebStorm), so we only
			// want to enable this transformation when we detect hosted DevTools has
			// connected. We do this by looking at the WebSocket handshake headers:
			//
			// # DevTools
			//
			// Upgrade: websocket
			// Host: localhost:9229
			// (from Chrome)  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36
			// (from Firefox) User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/116.0
			// Origin: https://devtools.devprod.cloudflare.dev
			// ...
			//
			// # VSCode
			//
			// Upgrade: websocket
			// Host: localhost
			// ...
			//
			// # WebStorm
			//
			// Upgrade: websocket
			// Host: localhost:9229
			// Origin: http://localhost:9229
			// ...
			//
			// From this, we could just use the presence of a `User-Agent` header to
			// determine if DevTools connected, but VSCode/WebStorm could very well
			// add this in future versions. We could also look for an `Origin` header
			// matching the hosted DevTools URL, but this would prevent preview/local
			// versions working. Instead, we look for a browser-like `User-Agent`.
			const userAgent = req.headers.get("User-Agent") ?? "";
			const hasFileSystemAccess = !/mozilla/i.test(userAgent);

			this.#websockets.devtools = devtools;
			this.#websockets.devtoolsHasFileSystemAccess = hasFileSystemAccess;

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

	sendDebugLog: typeof console.debug = (...args) => {
		this.sendProxyControllerRequest({ type: "debug-log", args });
	};
}

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
