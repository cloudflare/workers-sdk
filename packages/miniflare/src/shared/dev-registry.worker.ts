import http from "node:http";
import net from "node:net";
import { Duplex } from "node:stream";
import { parentPort } from "node:worker_threads";
import { HOST_CAPNP_CONNECT } from "../plugins/shared/constants";
import {
	extractDoFetchProxyTarget,
	extractServiceFetchProxyTarget,
	getProtocol,
	INBOUND_DO_PROXY_SERVICE_PATH,
} from "../shared/external-service";
import { Log } from "./log";
import type { WorkerDefinition } from "../shared/dev-registry";
import type { MessagePort } from "node:worker_threads";

interface ProxyAddress {
	protocol: "http" | "https";
	host: string;
	port: number;
	httpStyle?: "host" | "proxy";
	path?: string;
}

const log = new Log();

/**
 * A HTTP proxy server for the dev registry.
 * This runs in a separate thread to prevent a deadlock when using a node binding
 */
class ProxyServer {
	private registry: Record<string, WorkerDefinition> = {};
	private runtimeEntryURL: string | null = null;
	private fallbackServicePorts: Record<string, Record<string, number>> = {};
	private subscribers: Map<string, Array<() => void>> = new Map();

	constructor(private messagePort: MessagePort) {
		this.setupMessageHandlers();
	}

	private setupMessageHandlers() {
		this.messagePort.on("message", (message) => {
			switch (message.type) {
				case "update":
					this.updateRegistry(message.workers);
					break;
				case "setup":
					this.runtimeEntryURL = message.runtimeEntryURL;
					this.fallbackServicePorts = message.fallbackServicePorts;
					break;
				default:
					// Ignore unknown message types
					break;
			}
		});
	}

	public async start() {
		try {
			// Listen on a random port
			await new Promise<void>((resolve, reject) => {
				const server = http.createServer({
					// There might be no HOST header when proxying a fetch request made over service binding
					//  e.g. env.MY_WORKER.fetch("https://example.com")
					requireHostHeader: false,
				});

				server.on("request", this.handleRequest.bind(this));
				server.on("connect", this.handleConnect.bind(this));
				server.listen(0, "127.0.0.1", () => {
					const address = server.address();

					if (!address || typeof address === "string") {
						reject(new Error("Failed to get server address"));
						return;
					}

					// Notify parent that server is ready with the port
					this.messagePort.postMessage({
						type: "ready",
						address: `${address.address}:${address.port}`,
					});

					resolve();
				});
				server.on("error", reject);
			});
		} catch (error) {
			this.messagePort.postMessage({
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse
	): void {
		const serviceProxyTarget = extractServiceFetchProxyTarget(req);
		if (serviceProxyTarget) {
			const address = this.getServiceAddress(
				serviceProxyTarget.service,
				serviceProxyTarget.entrypoint
			);

			this.handleProxy(req, res, address);
			return;
		}

		const doProxyTarget = extractDoFetchProxyTarget(req);
		if (doProxyTarget) {
			const address = this.getDurableObjectAddress(
				doProxyTarget.scriptName,
				doProxyTarget.className
			);

			if (!address) {
				res.writeHead(503);
				res.end("Service Unavailable");
				return;
			}

			this.handleProxy(req, res, address);
			return;
		}

		// If no valid target found, return 404
		res.writeHead(404);
		res.end("Not Found");
	}

	private async handleConnect(
		req: http.IncomingMessage,
		clientSocket: Duplex,
		head: Buffer
	) {
		try {
			const connectHost = req.url;
			const [serviceName, entrypoint] = connectHost?.split(":") ?? [];
			const address = this.getServiceAddress(serviceName, entrypoint);
			const serverSocket = net.connect(address.port, address.host, () => {
				serverSocket.write(`CONNECT ${HOST_CAPNP_CONNECT} HTTP/1.1\r\n\r\n`);

				// Push along any buffered bytes
				if (head && head.length) {
					serverSocket.write(head);
				}

				serverSocket.pipe(clientSocket);
				clientSocket.pipe(serverSocket);
			});

			// Errors on either side
			serverSocket.on("error", (error) => {
				log.error(error);
				clientSocket.end();
			});
			clientSocket.on("error", () => serverSocket.end());
			// Close the tunnel if the service is updated
			// This make sure workerd will re-connect to the latest address
			this.subscribe(serviceName, () => {
				log.debug(`Closing tunnel as service "${serviceName}" was updated`);
				clientSocket.end();
			});
		} catch (e) {
			log.error(e instanceof Error ? e : new Error(`${e}`));
			clientSocket.end();
		}
	}

	private getServiceAddress(service: string, entrypoint: string): ProxyAddress {
		const target = this.registry?.[service];
		const entrypointAddress = target?.entrypointAddresses[entrypoint];

		if (entrypointAddress !== undefined) {
			return {
				httpStyle: "proxy",
				protocol: target.protocol,
				host: entrypointAddress.host,
				port: entrypointAddress.port,
			};
		}

		if (target && target.protocol !== "https" && entrypoint === "default") {
			// Fallback to sending requests directly to the entry worker
			return {
				httpStyle: "host",
				protocol: target.protocol,
				host: target.host,
				port: target.port,
			};
		}

		return this.getFallbackServiceAddress(service, entrypoint);
	}

	private getFallbackServiceAddress(
		service: string,
		entrypoint: string
	): ProxyAddress {
		if (!this.runtimeEntryURL) {
			throw new Error("No runtime entry URL set");
		}

		const url = new URL(this.runtimeEntryURL);
		const port = this.fallbackServicePorts[service]?.[entrypoint];

		if (!port) {
			throw new Error(
				`There is no socket opened for "${service}" with the "${entrypoint}" entrypoint`
			);
		}

		return {
			httpStyle: "proxy",
			protocol: getProtocol(url),
			host: url.hostname,
			port,
		};
	}

	private getDurableObjectAddress(
		scriptName: string,
		className: string
	): ProxyAddress | null {
		const target = this.registry?.[scriptName];

		if (
			target?.durableObjects.some(
				(durableObject) => durableObject.className === className
			)
		) {
			return {
				...target,
				path: `/${INBOUND_DO_PROXY_SERVICE_PATH}`,
			};
		}

		return null;
	}

	private handleProxy(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		target: ProxyAddress
	) {
		const headers = { ...req.headers };
		let path = target.path;

		if (!path) {
			switch (target.httpStyle) {
				case "host": {
					const url = new URL(req.url ?? `http://${req.headers.host}`);
					// If the target is a host, use the path from the request URL
					path = url.pathname + url.search + url.hash;
					headers.host = url.host;
					break;
				}
				case "proxy": {
					// If the target is a proxy, use the full request URL
					path = req.url;
					break;
				}
			}
		}

		const options: http.RequestOptions = {
			host: target.host,
			port: target.port,
			method: req.method,
			path,
			headers,
		};

		const upstream = http.request(options, (upRes) => {
			// Relay status and headers back to the original client
			res.writeHead(upRes.statusCode ?? 500, upRes.headers);
			// Pipe the response body
			upRes.pipe(res);
		});

		// Pipe the client request body to the upstream
		req.pipe(upstream);

		upstream.on("error", (error) => {
			log.error(
				new Error(
					`Failed to proxy request to ${target.protocol}://${target.host}:${target.port}${target.path ?? ""}`,
					{
						cause: error,
					}
				)
			);
			if (!res.headersSent) res.writeHead(502);
			res.end("Bad Gateway");
		});
	}

	/**
	 * To subscribe to updates for a specific worker once.
	 * This is currently used to close HTTP tunnels when a service is updated.
	 */
	private subscribe(workerName: string, callback: () => void): void {
		let callbacks = this.subscribers.get(workerName);

		if (!callbacks) {
			callbacks = [];
			this.subscribers.set(workerName, callbacks);
		}

		callbacks.push(callback);
	}

	/**
	 * Notify all subscribers of a worker that has been updated
	 */
	private notifySubscribers(workerName: string): void {
		const callbacks = this.subscribers.get(workerName);
		if (callbacks) {
			for (const callback of callbacks) {
				callback();
			}
		}

		// Delete the callback after notifying
		this.subscribers.delete(workerName);
	}

	/**
	 * Find out which workers have been updated and notify subscribers.
	 */
	private updateRegistry(workers: Record<string, WorkerDefinition>) {
		const workerNames = Object.keys(workers);

		// Cleanup existing definition that are not in the registry anymore
		for (const existingWorkerName of Object.keys(this.registry)) {
			if (!workerNames.includes(existingWorkerName)) {
				delete this.registry[existingWorkerName];
				this.notifySubscribers(existingWorkerName);
			}
		}

		for (const workerName of workerNames) {
			if (
				JSON.stringify(workers[workerName]) ===
				JSON.stringify(this.registry[workerName])
			) {
				continue; // No change, skip
			}

			this.registry[workerName] = workers[workerName];
			this.notifySubscribers(workerName);
		}
	}
}

function runProxyServer() {
	if (!parentPort) {
		throw new Error("This script must be run in a worker thread");
	}

	const server = new ProxyServer(parentPort);

	// Start the server
	server.start();
}

// Initialize the proxy server
runProxyServer();
