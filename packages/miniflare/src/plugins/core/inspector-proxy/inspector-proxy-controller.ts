import crypto from "node:crypto";
import { createServer, IncomingMessage, Server } from "node:http";
import { DeferredPromise } from "miniflare:shared";
import WebSocket, { WebSocketServer } from "ws";
import { version as miniflareVersion } from "../../../../package.json";
import { Log } from "../../../shared";
import { InspectorProxy } from "./inspector-proxy";

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

	async #getInspectorPort() {
		const server = await this.#server;
		const address = server.address();
		if (address && typeof address !== "string") {
			return address.port;
		} else {
			throw new Error(
				`Unable to acquire a port to listen on - address: "${address}"`
			);
		}
	}

	constructor(
		private inspectorPortOption: number,
		private inspectorHostOption: string = "127.0.0.1",
		private log: Log,
		private workerNamesToProxy: Set<string>
	) {
		this.#server = this.#createServer();
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

		this.#initializeWebSocketServer(server);

		await this.#startListening(server);

		return server;
	}

	async #restartServer() {
		const server = await this.#server;
		await this.#closeServer(server);
		await this.#startListening(server);
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
			server.once("error", reject);
			server.listen(
				this.inspectorPortOption,
				this.inspectorHostOption,
				resolve
			);
		});
	}

	async #closeServer(server: Server) {
		server.closeAllConnections();
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

	#initializeWebSocketServer(server: Server) {
		const devtoolsWebSocketServer = new WebSocketServer({ server });

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
		if (hostHeader == null) return { statusText: null, status: 400 };
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
		if (
			this.inspectorPortOption !== inspectorPortOption ||
			this.inspectorHostOption !== inspectorHostOption
		) {
			this.inspectorPortOption = inspectorPortOption;
			this.inspectorHostOption = inspectorHostOption;

			await this.#restartServer();
		}

		const workerdInspectorJson = (await fetch(
			`http://127.0.0.1:${runtimeInspectorPort}/json`
		).then((resp) => resp.json())) as {
			id: string;
		}[];

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
		await this.#runtimeConnectionEstablished;
	}

	get ready(): Promise<void> {
		return this.#waitForReady();
	}

	async dispose(): Promise<void> {
		await Promise.all(this.#proxies.map((proxy) => proxy.dispose()));

		const server = await this.#server;
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
	"cloudflare-devtools.pages.dev",
	/^[a-z0-9]+\.cloudflare-devtools\.pages\.dev$/,
	"127.0.0.1",
	"[::1]",
	"localhost",
];
