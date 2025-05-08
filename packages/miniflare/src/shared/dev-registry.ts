import { utimesSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { Duplex } from "node:stream";
import { FSWatcher, watch } from "chokidar";
import { HOST_CAPNP_CONNECT } from "../plugins";
import { HttpOptions, Service, SocketPorts } from "../runtime";
import { CoreHeaders } from "../workers";
import { Log } from "./log";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerEntrypointsDefinition = Record<
	"default" | string,
	{ host: string; port: number } | undefined
>;

export type WorkerDefinition = {
	port: number;
	protocol: "http" | "https";
	host: string;
	entrypointAddresses: WorkerEntrypointsDefinition;
	durableObjects: { name: string; className: string }[];
};

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registry: WorkerRegistry = {};
	private watcher: FSWatcher | undefined;
	public socketPorts: SocketPorts | undefined;

	constructor(
		private registryPath: string | undefined,
		private log: Log
	) {}

	/**
	 * Watch files inside the registry
	 */
	async watch(): Promise<void> {
		if (!this.registryPath || this.watcher) {
			return;
		}

		await this.refresh();

		this.watcher = watch(this.registryPath, { persistent: true }).on(
			"all",
			() => this.refresh()
		);
	}

	async dispose(): Promise<void> {
		if (this.watcher) {
			await this.watcher.close();
			this.watcher = undefined;
		}

		for (const heartbeat of this.heartbeats) {
			clearInterval(heartbeat[1]);
		}

		this.heartbeats.clear();
	}

	async updateRegistryPath(registryPath: string | undefined): Promise<void> {
		if (this.registryPath === registryPath) {
			// If the registry path hasn't changed, do nothing
			return;
		}

		this.registryPath = registryPath;

		await this.dispose();
		await this.watch();
	}

	/**
	 * Register a worker in the registry.
	 */
	async register(name: string, definition: WorkerDefinition) {
		if (!this.registryPath) {
			return;
		}

		const existingHeartbeat = this.heartbeats.get(name);
		if (existingHeartbeat) {
			clearInterval(existingHeartbeat);
		}
		await mkdir(this.registryPath, { recursive: true });
		await writeFile(
			path.join(this.registryPath, name),
			JSON.stringify(definition, null, 2)
		);
		this.heartbeats.set(
			name,
			setInterval(() => {
				if (this.registryPath) {
					utimesSync(
						path.join(this.registryPath, name),
						new Date(),
						new Date()
					);
				}
			}, 30_000)
		);
	}

	/**
	 * Unregister a worker in the registry.
	 */
	async unregister(name: string) {
		if (!this.registryPath) {
			return;
		}

		try {
			await unlink(path.join(this.registryPath, name));
			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}
		} catch (e) {
			this.log?.debug(`failed to unregister worker: ${e}`);
		}
	}

	handleExternalFetch(
		req: http.IncomingMessage,
		res?: http.ServerResponse
	): boolean {
		const service = req.headers[PROXY_SERVICE_HEADER];
		const entrypoint = req.headers[PROXY_ENTRYPOINT_HEADER];

		if (!res || typeof service !== "string" || typeof entrypoint !== "string") {
			// This is not a external fetch request. No proxying needed.
			return false;
		}

		delete req.headers[PROXY_SERVICE_HEADER];
		delete req.headers[PROXY_ENTRYPOINT_HEADER];

		const address = this.getExternalServiceAddress(service, entrypoint);
		const url = new URL(
			req.url ?? "/",
			`${address.protocol}://${req.headers.host}`
		);
		const options: http.RequestOptions = {
			host: address.host,
			port: address.port,
			method: req.method,
			// Workerd expects the full URL in the request instead of the path only
			// e.g. GET http://placeholder/test HTTP/1.1 instead of GET /test HTTP/1.1
			// Using req.url (the path) will result in TypeError: Invalid URL string.
			path: url.toString(),
			headers: req.headers,
		};
		const upstream = http.request(options, (upRes) => {
			// Relay status and headers back to the original client
			res.writeHead(upRes.statusCode ?? 500, upRes.headers);
			//Pipe the response body
			upRes.pipe(res);
		});

		// Pipe the client request body to the upstream
		req.pipe(upstream);

		upstream.on("error", (err) => {
			this.log.error(err);
			if (!res.headersSent) res.writeHead(502);
			res.end("Bad Gateway");
		});

		return true;
	}

	handleExternalRPCConnection(
		connectHost: string | undefined,
		clientSocket: Duplex,
		head: Buffer
	): boolean {
		if (!this.registryPath) {
			return false;
		}

		try {
			const [serviceName, entrypoint = "default"] =
				connectHost?.split(":") ?? [];
			const address = this.getExternalServiceAddress(serviceName, entrypoint);
			const serverSocket = net.connect(address.port, address.host, () => {
				serverSocket.write(`CONNECT ${HOST_CAPNP_CONNECT} HTTP/1.1\r\n\r\n`);

				// Push along any buffered bytes
				if (head && head.length) {
					serverSocket.write(head);
				}

				serverSocket.pipe(clientSocket);
			});

			// Errors on either side
			serverSocket.on("error", (err) => {
				this.log.error(err);
				clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
				clientSocket.end();
			});
			clientSocket.on("error", () => serverSocket.end());
		} catch {
			clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
			clientSocket.end();
		}

		return true;
	}

	private getExternalServiceAddress(
		service: string,
		entrypoint: string | undefined = "default"
	): { protocol: "http" | "https"; host: string; port: number } {
		if (!this.registry) {
			throw new Error("Registry not initialized yet");
		}

		const target = this.registry?.[service];

		let address = target?.entrypointAddresses[entrypoint];

		if (
			target &&
			!address &&
			entrypoint === "default" &&
			target.protocol !== "https"
		) {
			// Fallback to sending requests directly to the target
			address = target;
		}

		if (!address) {
			const port = this.socketPorts?.get(
				getExternalFallbackServiceSocketName(service, entrypoint)
			);

			if (!port) {
				throw new Error(
					`There is no socket opened for "${service}" with the "${entrypoint}" entrypoint`
				);
			}

			address = {
				host: "127.0.0.1",
				port,
			};
		}

		return {
			protocol: target?.protocol ?? "http",
			host: address.host,
			port: address.port,
		};
	}

	private async refresh() {
		if (!this.registryPath) {
			throw new Error("No registry path set");
		}

		await mkdir(this.registryPath, { recursive: true });

		this.registry ??= {};

		const newWorkers = new Set<string>();
		const workerDefinitions = await readdir(this.registryPath);

		for (const workerName of workerDefinitions) {
			try {
				const file = await readFile(
					path.join(this.registryPath, workerName),
					"utf8"
				);
				const stats = await stat(path.join(this.registryPath, workerName));
				// Cleanup existing workers older than 10 minutes
				if (stats.mtime.getTime() < Date.now() - 600000) {
					await this.unregister(workerName);
				} else {
					this.registry[workerName] = JSON.parse(file);
					newWorkers.add(workerName);
				}
			} catch (e) {
				// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel Wrangler process
				this.log?.debug(
					`Error while loading worker definition from the registry: ${e}`
				);
			}
		}

		for (const worker of Object.keys(this.registry)) {
			if (!newWorkers.has(worker)) {
				delete this.registry[worker];
			}
		}

		return this.registry;
	}
}

export function createExternalFallbackService(
	service: string,
	entrypoints: Set<string | undefined>
): Service {
	return {
		name: `dev-registry:fallback:${service}`,
		worker: {
			compatibilityDate: "2025-05-01",
			modules: [
				{
					name: "fallback-service.mjs",
					esModule: [
						`
							import { WorkerEntrypoint } from "cloudflare:workers";

							${CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT}

							function createNotFoundWorkerEntrypointClass({ service, entrypoint }) {
								const klass = createProxyPrototypeClass(WorkerEntrypoint, (key) => {
									throw new Error(\`Cannot access "\${key}" as we couldn't find a dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to.\`);
								});

								// Return regular HTTP response for HTTP requests
								klass.prototype.fetch = function(request) {
									const message = \`Couldn't find dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to\`;
									return new Response(message, { status: 503 });
								};

								return klass;
							}
						`,
						// Add stub object classes that proxy requests to the correct session
						...Array.from(entrypoints).map((entrypoint = "default") => {
							const serviceJson = JSON.stringify(service);
							const entrypointJson = JSON.stringify(entrypoint);
							return `export ${entrypoint === "default" ? "default" : `const ${entrypoint} =`} createNotFoundWorkerEntrypointClass({ service: ${serviceJson}, entrypoint: ${entrypointJson} });`;
						}),
					].join("\n"),
				},
			],
		},
	};
}

export function getExternalServiceHttpOptions(
	service: string,
	entrypoint: string | undefined
): HttpOptions {
	return {
		// TODO: Do I need to set a style?
		// style: HttpOptions_Style.HOST,
		cfBlobHeader: CoreHeaders.CF_BLOB,
		// The Connect Host is needed for RPC proxying
		capnpConnectHost: `${service}:${entrypoint ?? "default"}`,
		// The headers are needed for proxying fetch requests
		injectRequestHeaders: [
			{
				name: PROXY_SERVICE_HEADER,
				value: service,
			},
			{
				name: PROXY_ENTRYPOINT_HEADER,
				value: entrypoint ?? "default",
			},
		],
	};
}

export function getExternalFallbackServiceSocketName(
	service: string,
	entrypoint: string | undefined
): string {
	return `external-fallback-${service}-${entrypoint ?? "default"}`;
}

// Node HTTP server parsed headers are always in lowercase
const PROXY_SERVICE_HEADER = "Dev-Registry-Proxy-Service".toLowerCase();
const PROXY_ENTRYPOINT_HEADER = "Dev-Registry-Proxy-Entrypoint".toLowerCase();
const CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT = `
	const HANDLER_RESERVED_KEYS = new Set([
		"alarm",
		"scheduled",
		"self",
		"tail",
		"tailStream",
		"test",
		"trace",
		"webSocketClose",
		"webSocketError",
		"webSocketMessage",
	]);

	function createProxyPrototypeClass(handlerSuperKlass, getUnknownPrototypeKey) {
		// Build a class with a "Proxy"-prototype, so we can intercept RPC calls and
		// throw unsupported exceptions :see_no_evil:
		function klass(ctx, env) {
			// Delay proxying prototype until construction, so workerd sees this as a
			// regular class when introspecting it. This check fails if we don't do this:
			// https://github.com/cloudflare/workerd/blob/9e915ed637d65adb3c57522607d2cd8b8d692b6b/src/workerd/io/worker.c%2B%2B#L1920-L1921
			klass.prototype = new Proxy(klass.prototype, {
				get(target, key, receiver) {
					const value = Reflect.get(target, key, receiver);
					if (value !== undefined) return value;
					if (HANDLER_RESERVED_KEYS.has(key)) return;
					return getUnknownPrototypeKey(key);
				}
			});

			return Reflect.construct(handlerSuperKlass, [ctx, env], klass);
		}

		Reflect.setPrototypeOf(klass.prototype, handlerSuperKlass.prototype);
		Reflect.setPrototypeOf(klass, handlerSuperKlass);

		return klass;
	}
`;
