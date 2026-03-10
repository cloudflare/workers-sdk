import assert from "node:assert";
import {
	DevToolsCommandRequest,
	DevToolsCommandRequests,
	DevToolsCommandResponses,
	DevToolsEvent,
	DevToolsEvents,
	serialiseError,
} from "../../src/api/startDevWorker/events";
import {
	createDeferred,
	DeferredPromise,
	MaybePromise,
	urlFromParts,
} from "../../src/api/startDevWorker/utils";
import { assertNever } from "../../src/utils/assert-never";
import type {
	InspectorProxyWorkerIncomingWebSocketMessage,
	InspectorProxyWorkerOutgoingRequestBody,
	InspectorProxyWorkerOutgoingWebsocketMessage,
	ProxyData,
} from "../../src/api/startDevWorker/events";

const ALLOWED_HOST_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];
const ALLOWED_ORIGIN_HOSTNAMES = [
	"devtools.devprod.cloudflare.dev",
	"cloudflare-devtools.pages.dev",
	/^[a-z0-9]+\.cloudflare-devtools\.pages\.dev$/,
	"127.0.0.1",
	"[::1]",
	"localhost",
];

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
	constructor(
		_state: DurableObjectState,
		readonly env: Env
	) {}

	websockets: {
		proxyController?: WebSocket;
		runtime?: WebSocket;
		devtools?: WebSocket;

		// Browser DevTools cannot read the filesystem,
		// instead they fetch via `Network.loadNetworkResource` messages.
		// IDE DevTools can read the filesystem and expect absolute paths.
		devtoolsHasFileSystemAccess?: boolean;

		// We want to be able to delay devtools connection response
		// until we've connected to the runtime inspector server
		// so this deferred holds a promise to websockets.runtime
		runtimeDeferred: DeferredPromise<WebSocket>;
	} = {
		runtimeDeferred: createDeferred<WebSocket>(),
	};
	proxyData?: ProxyData;
	runtimeMessageBuffer: (DevToolsCommandResponses | DevToolsEvents)[] = [];

	// Only allow a limited number of error-based reconnections, so as not to infinite loop
	reconnectionsRemaining = 3;

	async fetch(req: Request) {
		if (
			req.headers.get("Authorization") === this.env.PROXY_CONTROLLER_AUTH_SECRET
		) {
			return this.handleProxyControllerRequest(req);
		}

		if (req.headers.get("Upgrade") === "websocket") {
			return this.handleDevToolsWebSocketUpgradeRequest(req);
		}

		return this.handleDevToolsJsonRequest(req);
	}

	// ************************
	// **  PROXY CONTROLLER  **
	// ************************

	handleProxyControllerRequest(req: Request) {
		assert(
			req.headers.get("Upgrade") === "websocket",
			"Expected proxy controller data request to be WebSocket upgrade"
		);

		const { 0: response, 1: proxyController } = new WebSocketPair();
		proxyController.accept();
		proxyController.addEventListener("close", (event) => {
			// don't reconnect the proxyController websocket
			// ProxyController can detect this event and reconnect itself

			this.sendDebugLog(
				"PROXY CONTROLLER WEBSOCKET CLOSED",
				event.code,
				event.reason
			);

			if (this.websockets.proxyController === proxyController) {
				this.websockets.proxyController = undefined;
			}
		});
		proxyController.addEventListener("error", (event) => {
			// don't reconnect the proxyController websocket
			// ProxyController can detect this event and reconnect itself

			const error = serialiseError(event.error);
			this.sendDebugLog("PROXY CONTROLLER WEBSOCKET ERROR", error);

			if (this.websockets.proxyController === proxyController) {
				this.websockets.proxyController = undefined;
			}
		});
		proxyController.addEventListener(
			"message",
			this.handleProxyControllerIncomingMessage
		);

		this.websockets.proxyController = proxyController;

		return new Response(null, {
			status: 101,
			webSocket: response,
		});
	}

	handleProxyControllerIncomingMessage = (event: MessageEvent) => {
		assert(
			typeof event.data === "string",
			"Expected event.data from proxy controller to be string"
		);

		const message: InspectorProxyWorkerIncomingWebSocketMessage = JSON.parse(
			event.data
		);

		this.sendDebugLog("handleProxyControllerIncomingMessage", event.data);

		switch (message.type) {
			case "reloadStart": {
				this.sendRuntimeDiscardConsoleEntries();

				break;
			}
			case "reloadComplete": {
				this.proxyData = message.proxyData;

				this.reconnectRuntimeWebSocket();

				break;
			}
			default: {
				assertNever(message);
			}
		}
	};

	sendProxyControllerMessage(
		message: string | InspectorProxyWorkerOutgoingWebsocketMessage
	) {
		message = typeof message === "string" ? message : JSON.stringify(message);

		// if the proxyController websocket is disconnected, throw away the message
		this.websockets.proxyController?.send(message);
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

	sendDebugLog: typeof console.debug = (...args) => {
		this.sendProxyControllerRequest({ type: "debug-log", args });
	};

	// ***************
	// **  RUNTIME  **
	// ***************

	handleRuntimeIncomingMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");

		const msg = JSON.parse(event.data) as
			| DevToolsCommandResponses
			| DevToolsEvents;
		this.sendDebugLog("RUNTIME INCOMING MESSAGE", msg);

		if (isDevToolsEvent(msg, "Runtime.exceptionThrown")) {
			this.sendProxyControllerMessage(event.data);
		}
		if (
			this.proxyData?.proxyLogsToController &&
			isDevToolsEvent(msg, "Runtime.consoleAPICalled")
		) {
			this.sendProxyControllerMessage(event.data);
		}

		this.runtimeMessageBuffer.push(msg);
		this.tryDrainRuntimeMessageBuffer();
	};

	handleRuntimeScriptParsed(msg: DevToolsEvent<"Debugger.scriptParsed">) {
		// If the devtools does not have filesystem access,
		// rewrite the sourceMapURL to use a special scheme.
		// This special scheme is used to indicate whether
		// to intercept each loadNetworkResource message.

		if (
			!this.websockets.devtoolsHasFileSystemAccess &&
			msg.params.sourceMapURL !== undefined &&
			// Don't try to find a sourcemap for e.g. node-internal: scripts
			msg.params.url.startsWith("file:")
		) {
			const url = new URL(msg.params.sourceMapURL, msg.params.url);
			// Check for file: in case msg.params.sourceMapURL has a different
			// protocol (e.g. data). In that case we should ignore this file
			if (url.protocol === "file:") {
				msg.params.sourceMapURL = url.href.replace("file:", "wrangler-file:");
			}
		}

		void this.sendDevToolsMessage(msg);
	}

	tryDrainRuntimeMessageBuffer = () => {
		// If we don't have a DevTools WebSocket, try again later
		if (this.websockets.devtools === undefined) return;

		// clear the buffer and replay each message to devtools
		for (const msg of this.runtimeMessageBuffer.splice(0)) {
			if (isDevToolsEvent(msg, "Debugger.scriptParsed")) {
				this.handleRuntimeScriptParsed(msg);
			} else {
				void this.sendDevToolsMessage(msg);
			}
		}
	};

	runtimeAbortController = new AbortController(); // will abort the in-flight websocket upgrade request to the remote runtime
	runtimeKeepAliveInterval: number | null = null;
	async reconnectRuntimeWebSocket() {
		assert(this.proxyData, "Expected this.proxyData to be defined");

		this.sendDebugLog("reconnectRuntimeWebSocket");

		this.websockets.runtime?.close();
		this.websockets.runtime = undefined;
		this.runtimeAbortController.abort();
		this.runtimeAbortController = new AbortController();
		this.websockets.runtimeDeferred = createDeferred<WebSocket>(
			this.websockets.runtimeDeferred
		);

		const runtimeWebSocketUrl = urlFromParts(
			this.proxyData.userWorkerInspectorUrl
		);
		runtimeWebSocketUrl.protocol = this.proxyData.userWorkerUrl.protocol; // http: or https:

		this.sendDebugLog("NEW RUNTIME WEBSOCKET", runtimeWebSocketUrl);

		// Make sure DevTools re-fetches script contents,
		// and uses the newly created execution context
		this.sendDevToolsMessage({
			method: "Runtime.executionContextsCleared",
			params: undefined,
		});

		const upgrade = await fetch(runtimeWebSocketUrl, {
			headers: {
				...this.proxyData.headers,
				"User-Agent": `wrangler/${this.env.WRANGLER_VERSION}`,
				Upgrade: "websocket",
			},
			signal: this.runtimeAbortController.signal,
		});

		const runtime = upgrade.webSocket;
		if (!runtime) {
			const error = new Error(
				`Failed to establish the WebSocket connection: expected server to reply with HTTP status code 101 (switching protocols), but received ${upgrade.status} instead.`
			);

			// Sometimes the backend will fail to connect the runtime websocket with a 502 error. These are usually transient, so try and reconnect
			if (upgrade.status === 502 && this.reconnectionsRemaining >= 0) {
				await scheduler.wait((3 - this.reconnectionsRemaining) * 1000);
				this.sendDebugLog(
					"RECONNECTING RUNTIME WEBSOCKET after 502. Reconnections remaining:",
					this.reconnectionsRemaining
				);

				return this.reconnectRuntimeWebSocket();
			}

			this.websockets.runtimeDeferred.reject(error);
			this.sendProxyControllerRequest({
				type: "runtime-websocket-error",
				error: serialiseError(error),
			});

			return;
		}

		this.websockets.runtime = runtime;

		runtime.addEventListener("message", this.handleRuntimeIncomingMessage);

		runtime.addEventListener("close", (event) => {
			this.sendDebugLog("RUNTIME WEBSOCKET CLOSED", event.code, event.reason);

			clearInterval(this.runtimeKeepAliveInterval);

			if (this.websockets.runtime === runtime) {
				this.websockets.runtime = undefined;
			}

			// don't reconnect the runtime websocket
			// if it closes unexpectedly (very rare or a case where reconnecting won't succeed anyway)
			// wait for a new proxy-data message or manual restart
		});

		runtime.addEventListener("error", (event) => {
			const error = serialiseError(event.error);
			this.sendDebugLog("RUNTIME WEBSOCKET ERROR", error);

			clearInterval(this.runtimeKeepAliveInterval);

			if (this.websockets.runtime === runtime) {
				this.websockets.runtime = undefined;
			}

			this.sendProxyControllerRequest({
				type: "runtime-websocket-error",
				error,
			});

			// don't reconnect the runtime websocket
			// if it closes unexpectedly (very rare or a case where reconnecting won't succeed anyway)
			// wait for a new proxy-data message or manual restart
		});

		runtime.accept();

		// fetch(Upgrade: websocket) resolves when the websocket is open
		// therefore the open event will not fire, so just trigger the handler
		this.handleRuntimeWebSocketOpen(runtime);
	}

	#runtimeMessageCounter = 1e8;
	nextCounter() {
		return ++this.#runtimeMessageCounter;
	}
	handleRuntimeWebSocketOpen(runtime: WebSocket) {
		this.sendDebugLog("RUNTIME WEBSOCKET OPENED");
		this.reconnectionsRemaining = 3;

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

		clearInterval(this.runtimeKeepAliveInterval);
		this.runtimeKeepAliveInterval = setInterval(() => {
			this.sendRuntimeMessage(
				{ method: "Runtime.getIsolateId", id: this.nextCounter() },
				runtime
			);
		}, 10_000) as any;

		this.websockets.runtimeDeferred.resolve(runtime);
	}

	sendRuntimeDiscardConsoleEntries() {
		// by default, sendRuntimeMessage waits for the runtime websocket to connect
		// but we only want to send this message now or never
		// if we schedule it to send later (like waiting for the websocket, by default)
		// then we risk clearing logs that have occured since we scheduled it too
		// which is worse than leaving logs from the previous version on screen
		if (this.websockets.runtime) {
			this.sendRuntimeMessage(
				{
					method: "Runtime.discardConsoleEntries",
					id: this.nextCounter(),
				},
				this.websockets.runtime
			);
		}
	}

	async sendRuntimeMessage(
		message: string | DevToolsCommandRequests,
		runtime: MaybePromise<WebSocket> = this.websockets.runtimeDeferred.promise
	) {
		runtime = await runtime;
		message = typeof message === "string" ? message : JSON.stringify(message);

		this.sendDebugLog("SEND TO RUNTIME", message);

		runtime.send(message);
	}

	// ****************
	// **  DEVTOOLS  **
	// ****************

	#inspectorId = crypto.randomUUID();
	async handleDevToolsJsonRequest(req: Request) {
		const url = new URL(req.url);

		if (url.pathname === "/json/version") {
			return Response.json({
				Browser: `wrangler/v${this.env.WRANGLER_VERSION}`,
				// TODO: (someday): The DevTools protocol should match that of workerd.
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

	async handleDevToolsWebSocketUpgradeRequest(req: Request) {
		// Validate `Host` header
		let hostHeader = req.headers.get("Host");
		if (hostHeader == null) return new Response(null, { status: 400 });
		try {
			const host = new URL(`http://${hostHeader}`);
			if (!ALLOWED_HOST_HOSTNAMES.includes(host.hostname)) {
				return new Response("Disallowed `Host` header", { status: 401 });
			}
		} catch {
			return new Response("Expected `Host` header", { status: 400 });
		}
		// Validate `Origin` header
		let originHeader = req.headers.get("Origin");
		if (originHeader === null && !req.headers.has("User-Agent")) {
			// VSCode doesn't send an `Origin` header, but also doesn't send a
			// `User-Agent` header, so allow an empty origin in this case.
			originHeader = "http://localhost";
		}
		if (originHeader === null) {
			return new Response("Expected `Origin` header", { status: 400 });
		}
		try {
			const origin = new URL(originHeader);
			const allowed = ALLOWED_ORIGIN_HOSTNAMES.some((rule) => {
				if (typeof rule === "string") return origin.hostname === rule;
				else return rule.test(origin.hostname);
			});
			if (!allowed) {
				return new Response("Disallowed `Origin` header", { status: 401 });
			}
		} catch {
			return new Response("Expected `Origin` header", { status: 400 });
		}

		// DevTools attempting to connect
		this.sendDebugLog("DEVTOOLS WEBSOCKET TRYING TO CONNECT");

		// Delay devtools connection response until we've connected to the runtime inspector server
		await this.websockets.runtimeDeferred.promise;

		this.sendDebugLog("DEVTOOLS WEBSOCKET CAN NOW CONNECT");

		assert(
			req.headers.get("Upgrade") === "websocket",
			"Expected DevTools connection to be WebSocket upgrade"
		);
		const { 0: response, 1: devtools } = new WebSocketPair();
		devtools.accept();

		if (this.websockets.devtools !== undefined) {
			/** We only want to have one active Devtools instance at a time. */
			// TODO(consider): prioritise new websocket over previous
			devtools.close(
				1013,
				"Too many clients; only one can be connected at a time"
			);
		} else {
			devtools.addEventListener("message", this.handleDevToolsIncomingMessage);
			devtools.addEventListener("close", (event) => {
				this.sendDebugLog(
					"DEVTOOLS WEBSOCKET CLOSED",
					event.code,
					event.reason
				);

				if (this.websockets.devtools === devtools) {
					this.websockets.devtools = undefined;
				}
			});
			devtools.addEventListener("error", (event) => {
				const error = serialiseError(event.error);
				this.sendDebugLog("DEVTOOLS WEBSOCKET ERROR", error);

				if (this.websockets.devtools === devtools) {
					this.websockets.devtools = undefined;
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

			this.sendDebugLog("DEVTOOLS WEBSOCKET CONNECTED");

			// Our patched DevTools are hosted on a `https://` URL. These cannot
			// access `file://` URLs, meaning local source maps cannot be fetched.
			// To get around this, we can rewrite `Debugger.scriptParsed` events to
			// include a special `worker:` scheme for source maps, and respond to
			// `Network.loadNetworkResource` commands for these. Unfortunately, this
			// breaks IDE's built-in debuggers (e.g. VSCode and WebStorm), so we only
			// want to enable this transformation when we detect hosted DevTools has
			// connected. We do this by looking at the WebSocket handshake headers:
			//
			//  DevTools
			//
			// Upgrade: websocket
			// Host: localhost:9229
			// (from Chrome)  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36
			// (from Firefox) User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/116.0
			// Origin: https://devtools.devprod.cloudflare.dev
			// ...
			//
			//  VSCode
			//
			// Upgrade: websocket
			// Host: localhost
			// ...
			//
			//  WebStorm
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

			this.websockets.devtools = devtools;
			this.websockets.devtoolsHasFileSystemAccess = hasFileSystemAccess;

			this.tryDrainRuntimeMessageBuffer();
		}

		return new Response(null, { status: 101, webSocket: response });
	}

	handleDevToolsIncomingMessage = (event: MessageEvent) => {
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
			this.sendDebugLog(
				`ProxyController could not resolve Network.loadNetworkResource for "${message.params.url}"`
			);

			// When the ProxyController cannot resolve a resource, let the runtime handle the request
			this.sendRuntimeMessage(JSON.stringify(message));
		} else {
			// this.websockets.devtools can be undefined here
			// the incoming message implies we have a devtools connection, but after
			// the await it could've dropped in which case we can safely not respond
			this.sendDevToolsMessage({
				id: message.id,
				// @ts-expect-error DevTools Protocol type does not match our patched devtools -- result.resource.text was added
				result: { resource: { success: true, text: response } },
			});
		}
	}

	sendDevToolsMessage(
		message: string | DevToolsCommandResponses | DevToolsEvents
	) {
		message = typeof message === "string" ? message : JSON.stringify(message);

		this.sendDebugLog("SEND TO DEVTOOLS", message);

		this.websockets.devtools?.send(message);
	}
}
