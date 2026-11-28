import crypto from "node:crypto";
import { createServer } from "node:http";
import { DeferredPromise } from "miniflare:shared";
import WebSocket, { WebSocketServer } from "ws";
import { version as miniflareVersion } from "../../../../package.json";
import { InspectorProxy } from "./inspector-proxy";
import type { Log } from "../../../shared";
import type { IncomingMessage, Server } from "node:http";

/**
 * An `InspectorProxyController` connects to the various runtime (/workerd) inspector servers and exposes through the user specified
 * inspector port the appropriate workers.
 *
 * The controller:
 *  - implements the various discovery `/json/*` endpoints that inspector clients query (exposing only the appropriate workers)
 *  - creates a proxy for each worker
 *  - when a web socket connection is requested for a worker it passes such request to the appropriate proxy
 */
export class InspectorProxyController {
	#runtimeConnectionEstablished = new DeferredPromise<void>();

	#proxies: InspectorProxy[] = [];

	#server: Promise<Server>;
	/** The DevTools WebSocket server attached to each HTTP server */
	#devtoolsWebSocketServers = new WeakMap<Server, WebSocketServer>();

	async #getInspectorPort() {
		// Rethrows the error if the server failed to listen
		await this.#server;
		const port = await this.#getListeningPort();
		if (port === undefined) {
			throw new Error("Unable to acquire a port to listen on");
		}
		return port;
	}

	/** The port the server listens on, or `undefined` if it isn't listening */
	async #getListeningPort(): Promise<number | undefined> {
		const server = await this.#server.catch(() => undefined);
		const address = server?.address();
		return address && typeof address !== "string" ? address.port : undefined;
	}

	constructor(
		private inspectorPortOption: number,
		private inspectorHostOption: string = "127.0.0.1",
		private log: Log,
		private workerNamesToProxy: Set<string>
	) {
		this.#server = this.#createServer();
		// The server starts before callers can observe `ready`, so attach a
		// rejection handler immediately while preserving the original promise for
		// public methods to await
		void this.#server.catch(() => {});
	}

	async #createServer() {
		const server = createServer(async (req, res) => {
			const maybeJson = await this.#handleDevToolsJsonRequest(
				req.headers.host ?? "localhost",
				req.url ?? "/"
			);

			if (maybeJson !== null) {
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify(maybeJson));
				return;
			}

			res.statusCode = 404;
			res.end(null);
		});

		await this.#startListening(server);
		this.#initializeWebSocketServer(server);

		return server;
	}

	/**
	 * Moves the server to the current host and port options.
	 *
	 * On the same host, the new server listens before the old one closes, so
	 * the inspector stays reachable throughout, and port 0 can't be given the
	 * old port back. When the host changes, the old server closes first: the
	 * new port may be the old one, and if the new server fails to listen, the
	 * old host, which may be reachable from the network, mustn't keep serving.
	 *
	 * If the new server can't listen, the old server and the options stay as
	 * they were, so a later update tries again. The old server keeps serving
	 * unless it was closed first.
	 */
	async #restartServer(previousOptions: { port: number; host: string }) {
		const oldServer = await this.#server.catch(() => undefined);
		const closeFirst = this.inspectorHostOption !== previousOptions.host;
		if (oldServer !== undefined && closeFirst) {
			await this.#closeServer(oldServer);
		}
		const newServer = this.#createServer();
		void newServer.catch(() => {});
		try {
			await newServer;
		} catch (error) {
			if (oldServer === undefined) {
				this.#server = newServer;
			} else {
				// Keep a server that has listened before, even if closed. Miniflare
				// waits on `#server` for readiness, also once the inspector is
				// disabled, so a failed listen must not stay stored there.
				this.inspectorPortOption = previousOptions.port;
				this.inspectorHostOption = previousOptions.host;
			}
			throw error;
		}
		this.#server = newServer;
		if (oldServer?.listening) {
			await this.#closeServer(oldServer);
		}
	}

	/**
	 * Try to start listening on a the chosen port (or any port if none-chosen).
	 *
	 * @param server the server to start listening.
	 */
	async #startListening(server: Server): Promise<void> {
		this.log.debug(
			`Trying to listen on ${this.inspectorHostOption}:${this.inspectorPortOption}`
		);
		return new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				server.close();
				reject(error);
			};
			server.prependOnceListener("error", onError);
			server.listen(this.inspectorPortOption, this.inspectorHostOption, () => {
				server.off("error", onError);
				resolve();
			});
		});
	}

	async #closeServer(server: Server) {
		this.#closeAllConnections(server);
		return await new Promise<void>((resolve) => {
			// We'll resolve whether or not the close had an error.
			server.close((err) => {
				if (err) {
					this.log.error(err);
				}
				resolve();
			});
		});
	}

	/**
	 * Closes the server's connections so `close()` doesn't wait for them.
	 * `closeAllConnections()` doesn't close upgraded connections, so DevTools
	 * WebSocket connections are terminated separately.
	 */
	#closeAllConnections(server: Server) {
		server.closeAllConnections();
		for (const devtoolsWs of this.#devtoolsWebSocketServers.get(server)
			?.clients ?? []) {
			devtoolsWs.terminate();
		}
	}

	#initializeWebSocketServer(server: Server) {
		const devtoolsWebSocketServer = new WebSocketServer({ server });
		this.#devtoolsWebSocketServers.set(server, devtoolsWebSocketServer);
		devtoolsWebSocketServer.on("error", (error) => this.log.error(error));

		devtoolsWebSocketServer.on("connection", (devtoolsWs, upgradeRequest) => {
			const validationError =
				this.#validateDevToolsWebSocketUpgradeRequest(upgradeRequest);
			if (validationError !== null) {
				devtoolsWs.close();
				return;
			}

			const proxy = this.#proxies.find(
				({ path }) => upgradeRequest.url === path
			);

			if (!proxy) {
				this.log.warn(
					`Warning: An inspector connection was requested for the ${upgradeRequest.url} path but no such inspector exists`
				);
				devtoolsWs.close();
				return;
			}

			proxy.onDevtoolsConnected(
				devtoolsWs,
				this.#checkIfDevtoolsHaveFileSystemAccess(upgradeRequest)
			);
		});
	}

	#validateDevToolsWebSocketUpgradeRequest(req: IncomingMessage) {
		// Validate `Host` header
		const hostHeader = req.headers.host;
		if (hostHeader == null) {
			return { statusText: null, status: 400 };
		}
		try {
			const host = new URL(`http://${hostHeader}`);
			// Allow the configured inspector host in addition to the default allowed hostnames
			const allowedHostnames = [
				...ALLOWED_HOST_HOSTNAMES,
				this.inspectorHostOption,
			];
			if (!allowedHostnames.includes(host.hostname)) {
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
				if (typeof rule === "string") {
					return origin.hostname === rule;
				} else {
					return rule.test(origin.hostname);
				}
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

		return hasFileSystemAccess;
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
			return this.#proxies.map(({ workerName }) => {
				const localHost = `${host}/${workerName}`;
				const devtoolsFrontendUrl = `https://devtools.devprod.cloudflare.dev/js_app?theme=systemPreferred&debugger=true&ws=${localHost}`;

				return {
					id: `${this.#inspectorId}-${workerName}`,
					type: "node", // TODO: can we specify different type?
					description: "workers",
					webSocketDebuggerUrl: `ws://${localHost}`,
					devtoolsFrontendUrl,
					devtoolsFrontendUrlCompat: devtoolsFrontendUrl,
					// Below are fields that are visible in the DevTools UI.
					title:
						workerName.length === 0 || this.#proxies.length === 1
							? `Cloudflare Worker`
							: `Cloudflare Worker: ${workerName}`,
					faviconUrl: "https://workers.cloudflare.com/favicon.ico",
					// url: "http://" + localHost, // looks unnecessary
				};
			});
		}

		return null;
	}

	async getInspectorURL(): Promise<URL> {
		return getWebsocketURL(
			this.inspectorHostOption,
			await this.#getInspectorPort()
		);
	}

	async updateConnection(
		inspectorPortOption: number,
		inspectorHostOption: string,
		runtimeInspectorPort: number,
		workerNamesToProxy: Set<string>
	) {
		this.workerNamesToProxy = workerNamesToProxy;
		const hostChanged = this.inspectorHostOption !== inspectorHostOption;
		const portChanged = this.inspectorPortOption !== inspectorPortOption;
		// A fixed port the server already listens on, such as one it was given
		// through port 0, needs no restart. Closing and listening again would let
		// another process take the port in between.
		const alreadyListening =
			!hostChanged &&
			portChanged &&
			inspectorPortOption !== 0 &&
			inspectorPortOption === (await this.#getListeningPort());
		// A server that listened before but has been closed by a failed restart
		// listens again, even if the options haven't changed since
		const closedAfterFailedRestart =
			(await this.#server.then(
				() => true,
				() => false
			)) && (await this.#getListeningPort()) === undefined;
		const previousOptions = {
			port: this.inspectorPortOption,
			host: this.inspectorHostOption,
		};
		this.inspectorPortOption = inspectorPortOption;
		this.inspectorHostOption = inspectorHostOption;
		let restartError: unknown;
		if (
			((hostChanged || portChanged) && !alreadyListening) ||
			closedAfterFailedRestart
		) {
			try {
				await this.#restartServer(previousOptions);
			} catch (error) {
				restartError = error;
			}
		}
		// The runtime has already been replaced, so connect to it even if the
		// server failed to move. The server that kept listening then serves
		// the new runtime's Workers, not the stopped one's.
		await this.#connectToRuntime(runtimeInspectorPort);
		if (restartError !== undefined) {
			throw restartError;
		}
		await this.#server;
	}

	async #connectToRuntime(runtimeInspectorPort: number) {
		const workerdInspectorJson = (await fetch(
			`http://127.0.0.1:${runtimeInspectorPort}/json`
		).then((resp) => resp.json())) as {
			id: string;
		}[];

		// Dispose old proxies before replacing them, so their runtime WebSocket
		// connections and keepalive intervals are properly cleaned up.
		await Promise.all(this.#proxies.map((proxy) => proxy.dispose()));

		this.#proxies = workerdInspectorJson
			.map(({ id }) => {
				if (!id.startsWith("core:user:")) {
					return;
				}

				const workerName = id.replace(/^core:user:/, "");

				if (!this.workerNamesToProxy.has(workerName)) {
					return;
				}

				return new InspectorProxy(
					this.log,
					workerName,
					new WebSocket(`ws://127.0.0.1:${runtimeInspectorPort}/${id}`)
				);
			})
			.filter(Boolean) as InspectorProxy[];

		this.#runtimeConnectionEstablished.resolve();
	}

	async #waitForReady() {
		await Promise.all([this.#server, this.#runtimeConnectionEstablished]);
	}

	get ready(): Promise<void> {
		return this.#waitForReady();
	}

	async dispose(): Promise<void> {
		await Promise.all(this.#proxies.map((proxy) => proxy.dispose()));

		const server = await this.#server;
		// A failed move to another host leaves a server that has already closed
		if (!server.listening) {
			return;
		}
		// Force-close active connections so server.close() resolves immediately.
		// Without this, active HTTP keep-alive or WebSocket connections prevent
		// the close callback from firing, hanging the dispose.
		this.#closeAllConnections(server);
		return new Promise((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		});
	}
}

function getWebsocketURL(host: string, port: number): URL {
	return new URL(`ws://${host}:${port}`);
}

const ALLOWED_HOST_HOSTNAMES = ["127.0.0.1", "[::1]", "localhost"];
const ALLOWED_ORIGIN_HOSTNAMES = [
	"devtools.devprod.cloudflare.dev",
	// Workers + Assets (current deployment)
	"cloudflare-devtools.devprod.workers.dev",
	/^[a-z0-9]+-cloudflare-devtools\.devprod\.workers\.dev$/,
	// Cloudflare Pages (legacy deployment)
	"cloudflare-devtools.pages.dev",
	/^[a-z0-9]+\.cloudflare-devtools\.pages\.dev$/,
	"127.0.0.1",
	"[::1]",
	"localhost",
];
