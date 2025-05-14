import assert from "node:assert";
import {
	existsSync,
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
import { getUserServiceName } from "../plugins/core";
import {
	HttpOptions,
	kVoid,
	Service,
	Worker_DurableObjectNamespace,
} from "../runtime";
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

	public isEnabled(): boolean {
		return this.registryPath !== undefined;
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
					const definitionPath = this.registryPath
						? path.join(this.registryPath, name)
						: null;

					if (definitionPath && existsSync(definitionPath)) {
						utimesSync(definitionPath, new Date(), new Date());
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

	public getExtneralDurableObjectAddress(
		scriptName: string,
		className: string
	): {
		protocol: "http" | "https";
		host: string;
		port: number;
		path: string;
	} | null {
		if (!this.registry) {
			throw new Error("Registry not initialized yet");
		}

		const target = this.registry?.[scriptName];

		if (
			!target ||
			target.durableObjects.every(
				(durableObject) => durableObject.className !== className
			)
		) {
			return null;
		}

		return {
			...target,
			path: `/${INTERNAL_DO_PROXY_SERVICE_PATH}`,
		};
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

export function getExternalServiceName(service: string) {
	return `proxy:external:${service}`;
}

export function createExternalService(options: {
	serviceName: string;
	entrypoints: Map<string | undefined, "service" | "durableObject">;
	proxyURL: string;
	isDevRegistryEnabled: boolean;
}): Service {
	return {
		name: getUserServiceName(getExternalServiceName(options.serviceName)),
		worker: {
			compatibilityDate: "2025-05-01",
			// Use in-memory storage for the stub object classes *declared* by this
			// script. They don't need to persist anything, and would end up using the
			// incorrect unsafe unique key.
			durableObjectStorage: { inMemory: kVoid },
			durableObjectNamespaces: Array.from(
				options.entrypoints
			).flatMap<Worker_DurableObjectNamespace>(([className, type]) => {
				if (type === "durableObject") {
					return [
						{
							className,
							uniqueKey: `${options.serviceName}-${className}`,
						} satisfies Worker_DurableObjectNamespace,
					];
				}

				return [];
			}),
			modules: [
				{
					name: "fallback-service.mjs",
					esModule: [
						`
							import { WorkerEntrypoint, DurableObject } from "cloudflare:workers";

							${CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT}

							function createFallbackWorkerEntrypointClass({ service, entrypoint }) {
								const klass = createProxyPrototypeClass(WorkerEntrypoint, (key) => {
									throw new Error(
										${
											options.isDevRegistryEnabled
												? `\`Cannot access "\${key}" as we couldn't find a local dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to.\``
												: `\`Worker Entrypoint "\${entrypoint}" of service "\${service}" is not defined in the options. Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.\``
										}
									);
								});

								// Return regular HTTP response for HTTP requests
								klass.prototype.fetch = function(request) {
									const message = ${
										options.isDevRegistryEnabled
											? `\`Couldn't find a local dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to\``
											: `\`Worker Entrypoint "\${entrypoint}" of service "\${service}" is not defined in the options. Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.\``
									};
									return new Response(message, { status: 503 });
								};

								return klass;
							}

							function createProxyDurableObjectClass({ scriptName, className, proxyUrl }) {
								const klass = createProxyPrototypeClass(DurableObject, (key) => {
									throw new Error(${
										options.isDevRegistryEnabled
											? `\`Cannot access "\${key}" as Durable Object RPC is not yet supported between multiple dev sessions.\``
											: `\`Durable Object "\${className}" of script "\${scriptName}" is not defined in the options. Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.\``
									});
								});

								// Forward regular HTTP requests to the other dev session
								klass.prototype.fetch = function(request) {
									const proxyRequest = new Request(proxyUrl, request);
									proxyRequest.headers.set("${PROXY_OBJECT_URL_HEADER}", request.url);
									proxyRequest.headers.set("${PROXY_OBJECT_NAME_HEADER}", className);
									proxyRequest.headers.set("${PROXY_OBJECT_SCRIPT_HEADER}", scriptName);
									proxyRequest.headers.set("${PROXY_OBJECT_ID_HEADER}", this.ctx.id.toString());
									proxyRequest.headers.set("${PROXY_OBJECT_CF_BLOB_HEADER}", JSON.stringify(request.cf ?? {}));
									return fetch(proxyRequest);
								};

								return klass;
							}
						`,
						...Array.from(options.entrypoints).map(
							([entrypoint = "default", type]) => {
								const service = options.serviceName;
								const proxyURL = options.proxyURL;

								switch (type) {
									case "service":
										return `export ${entrypoint === "default" ? "default" : `const ${entrypoint} =`} createFallbackWorkerEntrypointClass({ service: "${service}", entrypoint: "${entrypoint}" });`;
									case "durableObject":
										return `export const ${entrypoint} = createProxyDurableObjectClass({ scriptName: "${service}", className: "${entrypoint}", proxyUrl: "${proxyURL}" });`;
									default:
										throw new Error(
											`Unsupported entrypoint type "${type}" for external service "${service}" `
										);
								}
							}
						),
					].join("\n"),
				},
			],
		},
	};
}

export const INTERNAL_DO_PROXY_SERVICE_NAME = "proxy:internal:do";

/**
 * A well known URL to the proxy worker
 * This should match the Wrangler implementation for backwards compatibility
 *
 * @see https://github.com/cloudflare/workers-sdk/blob/362cb0be3fa28bbf007491f7156ecb522bd7ee43/packages/wrangler/src/dev/miniflare.ts#L52-L59
 */
export const INTERNAL_DO_PROXY_SERVICE_PATH =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";

/*
 * Create a service that routes fetch requests to the internal durable objects
 * This is used to support external durable objects with the DevRegistry in which
 * The a proxy durable object is created and will forward requests to a well known
 * URL of the other workerd process
 */
export function createInternalDoProxyService(
	internalObjects: Array<[string, string]>
): Service {
	return {
		// This is treated as a user service to support custom routes
		name: getUserServiceName(INTERNAL_DO_PROXY_SERVICE_NAME),
		worker: {
			compatibilityDate: "2025-05-01",
			// Define bindings for each internal durable objects
			bindings: internalObjects.map(([scriptName, className]) => ({
				name: `${scriptName}_${className}`,
				durableObjectNamespace: {
					className,
					serviceName: getUserServiceName(scriptName),
				},
			})),
			modules: [
				{
					name: "proxy.mjs",
					esModule: `
						const HEADER_URL = "${PROXY_OBJECT_URL_HEADER}";
						const HEADER_NAME = "${PROXY_OBJECT_NAME_HEADER}";
						const HEADER_SCRIPT = "${PROXY_OBJECT_SCRIPT_HEADER}";
						const HEADER_ID = "${PROXY_OBJECT_ID_HEADER}";
						const HEADER_CF_BLOB = "${PROXY_OBJECT_CF_BLOB_HEADER}";

						export default {
							async fetch(request, env) {
								const originalUrl = request.headers.get(HEADER_URL);
								const className = request.headers.get(HEADER_NAME);
								const scriptName = request.headers.get(HEADER_SCRIPT);
								const idString = request.headers.get(HEADER_ID);
								const cfBlob = request.headers.get(HEADER_CF_BLOB);
								if (originalUrl === null || className === null || idString === null || cfBlob === null) {
									return new Response("Received Durable Object proxy request with missing headers", { status: 400 });
								}
								if (scriptName === null) {
									return new Response("Durable object proxy to a vite dev session requires wrangler v4.x.x or later", { status: 501 });
								}
								request = new Request(originalUrl, request);
								request.headers.delete(HEADER_URL);
								request.headers.delete(HEADER_NAME);
								request.headers.delete(HEADER_SCRIPT);
								request.headers.delete(HEADER_ID);
								request.headers.delete(HEADER_CF_BLOB);
								const ns = env[scriptName + '_' + className];
								const id = ns.idFromString(idString);
								const stub = ns.get(id);
								return stub.fetch(request, { cf: JSON.parse(cfBlob) });
							}
						}
					`,
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

export function getExternalServiceSocketName(
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

export function extractExternalServiceFetchProxyTarget(
	req: http.IncomingMessage
): {
	service: string;
	entrypoint: string;
} | null {
	// The parsed headers are always in lowercase
	const service = req.headers[PROXY_SERVICE_HEADER.toLowerCase()];
	const entrypoint = req.headers[PROXY_ENTRYPOINT_HEADER.toLowerCase()];

	if (typeof service !== "string" || typeof entrypoint !== "string") {
		// This is not a external fetch request. No proxying needed.
		return null;
	}

	// Remove the headers from the request
	// to avoid sending them to the target service
	delete req.headers[PROXY_SERVICE_HEADER.toLowerCase()];
	delete req.headers[PROXY_ENTRYPOINT_HEADER.toLowerCase()];

	return {
		service,
		entrypoint,
	};
}

export function extractExternalDoFetchProxyTarget(req: http.IncomingMessage): {
	scriptName: string;
	className: string;
} | null {
	// The parsed headers are always in lowercase
	// These headers will be removed by the proxy worker later
	const url = req.headers[PROXY_OBJECT_URL_HEADER.toLowerCase()];
	const id = req.headers[PROXY_OBJECT_ID_HEADER.toLowerCase()];
	const cfBlob = req.headers[PROXY_OBJECT_CF_BLOB_HEADER.toLowerCase()];
	const scriptName = req.headers[PROXY_OBJECT_SCRIPT_HEADER.toLowerCase()];
	const className = req.headers[PROXY_OBJECT_NAME_HEADER.toLowerCase()];

	if (
		typeof url !== "string" ||
		typeof id !== "string" ||
		typeof cfBlob !== "string" ||
		typeof scriptName !== "string" ||
		typeof className !== "string"
	) {
		// This is not a external do fetch request. No proxying needed.
		return null;
	}

	return {
		scriptName,
		className,
	};
}

// These headers must match the wrangler implementation for backwards compatibility
const PROXY_OBJECT_URL_HEADER = "X-Miniflare-Durable-Object-URL";
const PROXY_OBJECT_NAME_HEADER = "X-Miniflare-Durable-Object-Name";
const PROXY_OBJECT_ID_HEADER = "X-Miniflare-Durable-Object-Id";
const PROXY_OBJECT_CF_BLOB_HEADER = "X-Miniflare-Durable-Object-Cf-Blob";
// This is added to support fetching external DO with multi workers
const PROXY_OBJECT_SCRIPT_HEADER = "X-Miniflare-Durable-Object-Script";
// Theses headers are used to proxy fetch requests to external service bindings
const PROXY_SERVICE_HEADER = "X-Miniflare-Proxy-Service";
const PROXY_ENTRYPOINT_HEADER = "X-Miniflare-Proxy-Entrypoint";
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
