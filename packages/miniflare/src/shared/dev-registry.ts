import { utimesSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import { Service } from "../runtime";
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
	private workers: WorkerRegistry = {};

	constructor(
		private registryPath: string,
		private log?: Log
	) {}

	/**
	 * Watch files inside the registry
	 */
	async watch(
		callback?: (registry: WorkerRegistry) => void
	): Promise<() => Promise<void>> {
		const workers = await this.getWorkers();
		callback?.({ ...workers });

		const watcher = watch(this.registryPath, {
			persistent: true,
		}).on("all", async () => {
			const newWorkers = await this.refresh();
			callback?.({ ...newWorkers });
		});

		return async () => {
			await watcher.close();

			for (const heartbeat of this.heartbeats) {
				clearInterval(heartbeat[1]);
			}

			this.heartbeats.clear();
		};
	}

	/**
	 * Register a worker in the registry.
	 */
	async register(name: string, definition: WorkerDefinition) {
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
				utimesSync(path.join(this.registryPath, name), new Date(), new Date());
			}, 30_000)
		);
		return;
	}

	async unregister(name: string) {
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

	/**
	 * Get the state of the service registry.
	 */
	async getWorkers(): Promise<WorkerRegistry> {
		if (!this.workers) {
			return this.refresh();
		}

		return this.workers;
	}

	async refresh() {
		await mkdir(this.registryPath, { recursive: true });

		this.workers ??= {};

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
					this.workers[workerName] = JSON.parse(file);
					newWorkers.add(workerName);
				}
			} catch (e) {
				// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel Wrangler process
				this.log?.debug(
					`Error while loading worker definition from the registry: ${e}`
				);
			}
		}

		for (const worker of Object.keys(this.workers)) {
			if (!newWorkers.has(worker)) {
				delete this.workers[worker];
			}
		}

		return this.workers;
	}
}

const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
export function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
}

// This names should match wrangler setup for compatibility
export const EXTERNAL_FALLBACK_SERVICE_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";

export const EXTERNAL_FALLBACK_SOCKET_NAME = "external-fallback";

export function createExternalFallbackService(
	service: string,
	entrypoints: Set<string | undefined>
): Service {
	return {
		name: EXTERNAL_FALLBACK_SERVICE_NAME + service,
		worker: {
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
						// ...externalDOs.map(({ identifier, scriptName, className }) => {
						// 	const classNameJson = JSON.stringify(className);
						// 	const scriptNameJson = JSON.stringify(scriptName);
						// 	const proxyUrlJson = JSON.stringify(proxyUrl);
						// 	return `export const ${identifier} = createDurableObjectClass({ className: ${classNameJson}, scriptName: ${scriptNameJson}, proxyUrl: ${proxyUrlJson} });`;
						// }),
					].join("\n"),
				},
			],
			compatibilityDate: "2024-01-01",
			// TODO: className should be the binding name
			// durableObjectNamespaces: Object.entries(
			// 	workerOpts.do.durableObjects ?? {}
			// ).map(([namespace, config]) => {
			// 	if (typeof config === "string") {
			// 		return {
			// 			className: config,
			// 			scriptName: workerOpts.core.name,
			// 		};
			// 	}

			// 	return {
			// 		className: namespace,
			// 		enableSql: config.useSQLite,
			// 		scriptName: workerOpts.core.name,
			// 	};
			// }),
			// unsafeEphemeralDurableObjects: true,
			// routes: [`*/${EXTERNAL_SERVICE_WORKER_NAME}`],
		},
	};
}

export const CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT = `
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

// const EXTERNAL_SERVICE_WORKER_SCRIPT = `
// import { DurableObject } from "cloudflare:workers";

// const HEADER_URL = "X-Miniflare-Durable-Object-URL";
// const HEADER_NAME = "X-Miniflare-Durable-Object-Name";
// const HEADER_ID = "X-Miniflare-Durable-Object-Id";
// const HEADER_CF_BLOB = "X-Miniflare-Durable-Object-Cf-Blob";

// function createDurableObjectClass({ className, scriptName, proxyUrl }) {
// 	const klass = createProxyPrototypeClass(DurableObject, (key) => {
// 		throw new Error(\`Cannot access "\${className}#\${key}" on "\${scriptName}" as Durable Object RPC is not yet supported between multiple dev sessions.\`);
// 	});

// 	// Forward regular HTTP requests to the other dev session
// 	klass.prototype.fetch = function(request) {
// 		const proxyRequest = new Request(proxyUrl, request);
// 		proxyRequest.headers.set(HEADER_URL, request.url);
// 		proxyRequest.headers.set(HEADER_NAME, className);
// 		proxyRequest.headers.set(HEADER_ID, this.ctx.id.toString());
// 		proxyRequest.headers.set(HEADER_CF_BLOB, JSON.stringify(request.cf ?? {}));
// 		return fetch(proxyRequest);
// 	};

// 	return klass;
// }

// export default {
// 	async fetch(request, env) {
// 		const originalUrl = request.headers.get(HEADER_URL);
// 		const className = request.headers.get(HEADER_NAME);
// 		const idString = request.headers.get(HEADER_ID);
// 		const cf = JSON.parse(request.headers.get(HEADER_CF_BLOB));
// 		if (originalUrl === null || className === null || idString === null) {
// 			return new Response("[wrangler] Received Durable Object proxy request with missing headers", { status: 400 });
// 		}
// 		request = new Request(originalUrl, request);
// 		request.headers.delete(HEADER_URL);
// 		request.headers.delete(HEADER_NAME);
// 		request.headers.delete(HEADER_ID);
// 		request.headers.delete(HEADER_CF_BLOB);
// 		const ns = env[className];
// 		const id = ns.idFromString(idString);
// 		const stub = ns.get(id);
// 		return stub.fetch(request, { cf });
// 	}
// }
// `;
