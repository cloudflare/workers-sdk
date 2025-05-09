import assert from "node:assert";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { FSWatcher, watch } from "chokidar";
import { HttpOptions, Service } from "../runtime";
import { CoreHeaders } from "../workers";
import { Log } from "./log";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerEntrypointsDefinition = Record<
	"default" | string,
	{ host: string; port: number } | undefined
>;

export type WorkerDefinition = {
	protocol: "http" | "https";
	host: string;
	port: number;
	entrypointAddresses: WorkerEntrypointsDefinition;
	durableObjects: { name: string; className: string }[];
};

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registry: WorkerRegistry = {};
	private managedWorkers: Set<string> = new Set();
	private listeners: Map<string, Array<() => void>> = new Map();
	private watcher: FSWatcher | undefined;

	constructor(
		private registryPath: string | undefined,
		private log: Log
	) {}

	/**
	 * Watch files inside the registry directory for changes.
	 */
	public watch(): void {
		if (!this.registryPath || this.watcher) {
			return;
		}

		this.watcher = watch(this.registryPath, { persistent: true }).on(
			"all",
			() => this.refresh()
		);
		this.refresh();
	}

	/**
	 * Unregister all managed workers and close the watcher.
	 * This is a sync function that returns a promise
	 * to ensure all workers are unregistered within the exit hook
	 */
	public dispose(): Promise<void> | undefined {
		for (const worker of this.managedWorkers) {
			this.unregister(worker);
		}
		this.managedWorkers.clear();
		this.listeners.clear();
		this.registry = {};

		// Only this step is async and could be awaited
		return this.watcher?.close();
	}

	/**
	 * Unregister worker in the registry.
	 */
	private unregister(name: string): void {
		try {
			const existingHeartbeat = this.heartbeats.get(name);

			// Clear the check first before removing the files on disk
			if (existingHeartbeat) {
				this.heartbeats.delete(name);
				clearInterval(existingHeartbeat);
			}

			if (this.registryPath) {
				unlinkSync(path.join(this.registryPath, name));
			}

			this.notify(name);
		} catch (e) {
			this.log?.debug(`failed to unregister worker: ${e}`);
		}
	}

	public async updateRegistryPath(
		registryPath: string | undefined
	): Promise<void> {
		for (const worker of this.managedWorkers) {
			this.unregister(worker);
		}
		this.managedWorkers.clear();
		this.listeners.clear();
		this.registry = {};

		if (this.registryPath !== registryPath) {
			if (this.watcher) {
				await this.watcher.close();
				this.watcher = undefined;
			}
			this.watch();
		}
	}

	public register(workers: Record<string, WorkerDefinition>) {
		if (!this.registryPath) {
			return;
		}

		for (const [name, definition] of Object.entries(workers)) {
			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}
			mkdirSync(this.registryPath, { recursive: true });
			writeFileSync(
				path.join(this.registryPath, name),
				JSON.stringify(definition, null, 2)
			);
			this.managedWorkers.add(name);
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
	}

	public getExternalServiceAddress(
		service: string,
		entrypoint: string | undefined = "default"
	): {
		protocol: "http" | "https";
		host: string;
		port: number;
	} | null {
		if (!this.registry) {
			throw new Error("Registry not initialized yet");
		}

		const target = this.registry?.[service];
		const entrypointAddress = target?.entrypointAddresses[entrypoint];

		if (entrypointAddress !== undefined) {
			return {
				protocol: target.protocol,
				host: entrypointAddress.host,
				port: entrypointAddress.port,
			};
		}

		if (target && target.protocol !== "https" && entrypoint === "default") {
			// Fallback to sending requests directly to the entry worker
			return {
				protocol: target.protocol,
				host: target.host,
				port: target.port,
			};
		}

		return null;
	}

	public subscribe(service: string, callback: () => void): void {
		let callbacks = this.listeners.get(service);

		if (!callbacks) {
			callbacks = [];
			this.listeners.set(service, callbacks);
		}

		callbacks.push(callback);
	}

	private notify(service: string): void {
		const callbacks = this.listeners.get(service);
		if (callbacks) {
			for (const callback of callbacks) {
				callback();
			}
		}
	}

	private refresh(): void {
		if (!this.registryPath) {
			return;
		}

		mkdirSync(this.registryPath, { recursive: true });

		const newWorkers = new Set<string>();
		const workerDefinitions = readdirSync(this.registryPath);

		for (const workerName of workerDefinitions) {
			try {
				const file = readFileSync(
					path.join(this.registryPath, workerName),
					"utf8"
				);
				const stats = statSync(path.join(this.registryPath, workerName));
				// Cleanup existing workers older than 5 minutes
				if (stats.mtime.getTime() < Date.now() - 300_000) {
					this.unregister(workerName);
				} else {
					this.registry[workerName] = JSON.parse(file);
					this.notify(workerName);
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
				this.notify(worker);
			}
		}
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
		// To make sure `request.cf` is set correctly
		cfBlobHeader: CoreHeaders.CF_BLOB,
		// Use the service name and entrypoint as the host to proxy RPC calls
		capnpConnectHost: `${service}:${entrypoint ?? "default"}`,
		// The headers are injected only for fetch and are used for proxying fetch requests
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

export function getProtocol(url: URL): "http" | "https" {
	const protocol = url.protocol.substring(0, url.protocol.length - 1);

	assert(
		protocol === "http" || protocol === "https",
		"Expected protocol to be http or https"
	);

	return protocol;
}

export function extractExternalFetchProxyTarget(req: http.IncomingMessage): {
	service: string;
	entrypoint: string;
} | null {
	const service = req.headers[PROXY_SERVICE_HEADER];
	const entrypoint = req.headers[PROXY_ENTRYPOINT_HEADER];

	if (typeof service !== "string" || typeof entrypoint !== "string") {
		// This is not a external fetch request. No proxying needed.
		return null;
	}

	// Remove the headers from the request
	// to avoid sending them to the target service
	delete req.headers[PROXY_SERVICE_HEADER];
	delete req.headers[PROXY_ENTRYPOINT_HEADER];

	return {
		service,
		entrypoint,
	};
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
