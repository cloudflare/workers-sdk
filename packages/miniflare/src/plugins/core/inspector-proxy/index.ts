import assert from "node:assert";
import crypto from "node:crypto";
import { createServer, IncomingMessage, Server } from "node:http";
import { DeferredPromise } from "miniflare:shared";
import WebSocket, { WebSocketServer } from "ws";
import { version as miniflareVersion } from "../../../../package.json";
import type Protocol from "devtools-protocol/types/protocol-mapping";

export class InspectorProxy {
	#server: Server;
	#runtimeInspectorPort?: number;
	#devtoolsWs?: WebSocket;
	#runtimeWs?: WebSocket;
	#devtoolsHaveFileSystemAccess = false;

	constructor(private userInspectorPort: number) {
		this.#server = this.#initializeServer();
	}

	#initializeServer() {
		const server = createServer(async (req, res) => {
			const maybeJson = await this.#handleDevToolsJsonRequest(
				req.headers.host ?? "localhost",
				req.url ?? "/"
			);

			if (maybeJson !== null) {
				res.end(JSON.stringify(maybeJson));
			}

			res.statusCode = 404;
			res.end(null);
		});

		this.#initializeWebSocketServer(server);

		server.listen(this.userInspectorPort);

		return server;
	}

	#initializeWebSocketServer(server: Server) {
		const devtoolsWebSocketServer = new WebSocketServer({ server });

		devtoolsWebSocketServer.on("connection", (ws, upgradeRequest) => {
			/** We only want to have one active Devtools instance at a time. */
			assert(
				!this.#devtoolsWs,
				"Too many clients; only one can be connected at a time"
			);
			this.#devtoolsWs = ws;

			const validationError =
				this.#validateDevToolsWebSocketUpgradeRequest(upgradeRequest);
			if (validationError !== null) {
				this.#devtoolsWs.close();
				this.#devtoolsWs = undefined;
				return;
			}

			this.#checkIfDevtoolsHaveFileSystemAccess(upgradeRequest);

			assert(this.#runtimeWs?.OPEN);

			// let's send a `Debugger.enable` message when a client actually connects
			// (see: https://github.com/cloudflare/workers-sdk/issues/7956#issuecomment-2698124131)
			this.#sendMessageToRuntime({
				method: "Debugger.enable",
				id: this.nextCounter(),
			});

			ws.on("error", console.error);

			ws.once("close", () => {
				if (this.#runtimeWs?.OPEN) {
					// Since Miniflare proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
					// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
					// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
					// The key initialisation messages that are needed are the `Debugger.scriptParsed` events.
					this.#sendMessageToRuntime({
						method: "Debugger.disable",
						id: this.nextCounter(),
					});
				}
				this.#devtoolsWs = undefined;
			});

			ws.on("message", (data) => {
				const msg = JSON.parse(data.toString());
				console.log(`\x1b[44m msg devtools -> runtime \x1b[0m`);
				console.log(msg);
				console.log("\n");
				assert(this.#runtimeWs?.OPEN);
				this.#sendMessageToRuntime(msg);
			});
		});
	}

	#validateDevToolsWebSocketUpgradeRequest(req: IncomingMessage) {
		// Validate `Host` header
		const hostHeader = req.headers.host;
		if (hostHeader == null) return { statusText: null, status: 400 };
		try {
			const host = new URL(`http://${hostHeader}`);
			if (!ALLOWED_HOST_HOSTNAMES.includes(host.hostname)) {
				return { statusText: "Disallowed `Host` header", status: 401 };
			}
		} catch {
			return { statusText: "Expected `Host` header", status: 400 };
		}
		// Validate `Origin` header
		let originHeader = req.headers.origin;
		if (!originHeader && !req.headers["user-agent"]) {
			// VSCode doesn't send an `Origin` header, but also doesn't send a
			// `User-Agent` header, so allow an empty origin in this case.
			originHeader = "http://localhost";
		}
		if (!originHeader) {
			return { statusText: "Expected `Origin` header", status: 400 };
		}
		try {
			const origin = new URL(originHeader);
			const allowed = ALLOWED_ORIGIN_HOSTNAMES.some((rule) => {
				if (typeof rule === "string") return origin.hostname === rule;
				else return rule.test(origin.hostname);
			});
			if (!allowed) {
				return { statusText: "Disallowed `Origin` header", status: 401 };
			}
		} catch {
			return { statusText: "Expected `Origin` header", status: 400 };
		}

		return null;
	}

	#checkIfDevtoolsHaveFileSystemAccess(req: IncomingMessage) {
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
		const userAgent = req.headers["user-agent"] ?? "";
		const hasFileSystemAccess = !/mozilla/i.test(userAgent);

		this.#devtoolsHaveFileSystemAccess = hasFileSystemAccess;
	}

	#inspectorId = crypto.randomUUID();
	async #handleDevToolsJsonRequest(host: string, path: string) {
		if (path === "/json/version") {
			return {
				Browser: `miniflare/v${miniflareVersion}`,
				// TODO: (someday): The DevTools protocol should match that of workerd.
				// This could be exposed by the preview API.
				"Protocol-Version": "1.3",
			};
		}

		if (path === "/json" || path === "/json/list") {
			// TODO: can we remove the `/ws` here if we only have a single worker?
			const localHost = `${host}/ws`;
			const devtoolsFrontendUrl = `https://devtools.devprod.cloudflare.dev/js_app?theme=systemPreferred&debugger=true&ws=${localHost}`;

			return [
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
			];
		}

		return null;
	}

	#runtimeMessageCounter = 1e8;
	nextCounter() {
		return ++this.#runtimeMessageCounter;
	}

	#runtimeKeepAliveInterval: NodeJS.Timeout | undefined;

	#handleRuntimeWebSocketOpen() {
		assert(this.#runtimeWs?.OPEN);

		this.#sendMessageToRuntime({
			method: "Runtime.enable",
			id: this.nextCounter(),
		});
		this.#sendMessageToRuntime({
			method: "Network.enable",
			id: this.nextCounter(),
		});

		console.log(`\x1b[44m msg devtools -> runtime \x1b[0m`);
		console.log(JSON.stringify({ method: "Runtime.enable", id: "<id>" }));
		console.log(JSON.stringify({ method: "Network.enable", id: "<id>" }));
		console.log();

		clearInterval(this.#runtimeKeepAliveInterval);
		this.#runtimeKeepAliveInterval = setInterval(() => {
			if (this.#runtimeWs?.OPEN) {
				this.#sendMessageToRuntime({
					method: "Runtime.getIsolateId",
					id: this.nextCounter(),
				});
			}
		}, 10_000);
	}

	#handleRuntimeScriptParsed(msg: DevToolsEvent<"Debugger.scriptParsed">) {
		// If the devtools does not have filesystem access,
		// rewrite the sourceMapURL to use a special scheme.
		// This special scheme is used to indicate whether
		// to intercept each loadNetworkResource message.

		if (
			!this.#devtoolsHaveFileSystemAccess &&
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

		return this.#sendMessageToDevtools(msg);
	}

	// TODO: improve msg type
	#sendMessageToDevtools(msg: any) {
		assert(this.#devtoolsWs);

		if (!this.#devtoolsWs.OPEN) {
			// the devtools web socket is established but not yet connected
			this.#devtoolsWs.once("open", () =>
				this.#devtoolsWs?.send(JSON.stringify(msg))
			);
			return;
		}

		this.#devtoolsWs.send(JSON.stringify(msg));
	}

	// TODO: improve msg type
	#sendMessageToRuntime(msg: any) {
		assert(this.#runtimeWs?.OPEN);

		this.#runtimeWs.send(JSON.stringify(msg));
	}

	getInspectorURL(): URL {
		return getWebsocketURL(this.userInspectorPort);
	}

	// NOTE: this whole implementation assumes that there's a single runtime inspector socket,
	//       which is connected to the user worker, we'll need to expand this to multiple workers later
	async updateConnection(runtimeInspectorPort: number) {
		this.#runtimeInspectorPort = runtimeInspectorPort;

		// TODO: sendRuntimeDiscardConsoleEntries

		this.#runtimeWs?.close();
		this.#runtimeWs = new WebSocket(
			`ws://127.0.0.1:${this.#runtimeInspectorPort}/core:user:`
		);
		this.#runtimeWs.once("open", () => this.#handleRuntimeWebSocketOpen());
		this.#runtimeWs.on("message", (data) => {
			console.log(`\x1b[45m msg runtime -> devtools \x1b[0m`);
			const obj = JSON.parse(data.toString());
			console.log(obj);
			console.log("\n");

			if (!this.#devtoolsWs) {
				// there is no devtools connection established
				return;
			}

			if (isDevToolsEvent(obj, "Debugger.scriptParsed")) {
				return this.#handleRuntimeScriptParsed(obj);
			}

			return this.#sendMessageToDevtools(obj);
		});
	}

	async dispose(): Promise<void> {
		clearInterval(this.#runtimeKeepAliveInterval);

		this.#devtoolsWs?.close();

		const deferredPromise = new DeferredPromise<void>();
		this.#server.close((err) => {
			if (err) {
				deferredPromise.reject(err);
			} else {
				deferredPromise.resolve();
			}
		});
		return deferredPromise;
	}
}

function getWebsocketURL(port: number): URL {
	return new URL(`ws://127.0.0.1:${port}`);
}

const ALLOWED_HOST_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];
const ALLOWED_ORIGIN_HOSTNAMES = [
	"devtools.devprod.cloudflare.dev",
	"cloudflare-devtools.pages.dev",
	/^[a-z0-9]+\.cloudflare-devtools\.pages\.dev$/,
	"127.0.0.1",
	"[::1]",
	"localhost",
];

type _Params<ParamsArray extends [unknown?]> = ParamsArray extends [infer P]
	? P
	: undefined;

type _EventMethods = keyof Protocol.Events;

type DevToolsEvent<Method extends _EventMethods> = Method extends unknown
	? {
			method: Method;
			params: _Params<Protocol.Events[Method]>;
		}
	: never;

function isDevToolsEvent<Method extends DevToolsEvent<_EventMethods>["method"]>(
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
