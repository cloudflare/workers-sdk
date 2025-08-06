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
import path from "node:path";
import { Worker } from "node:worker_threads";
import { FSWatcher, watch } from "chokidar";
import { SocketPorts } from "../runtime";
import { getProxyFallbackServiceSocketName } from "./external-service";
import { Log } from "./log";
import { getGlobalWranglerConfigPath } from "./wrangler";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerDefinition = {
	protocol: "http" | "https";
	host: string;
	port: number;
	entrypointAddresses: Record<
		"default" | string,
		{ host: string; port: number } | undefined
	>;
	durableObjects: { name: string; className: string }[];
};

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registry: WorkerRegistry = {};
	private registeredWorkers: Set<string> = new Set();
	private externalServices: Map<
		string,
		{
			classNames: Set<string>;
			entrypoints: Set<string | undefined>;
		}
	> = new Map();
	private watcher: FSWatcher | undefined;
	private proxyWorker: Worker | undefined;
	private proxyAddress: string | undefined;

	constructor(
		private registryPath: string | undefined,
		private enableDurableObjectProxy: boolean,
		private onUpdate: ((registry: WorkerRegistry) => void) | undefined,
		private log: Log
	) {}

	/**
	 * Watch files inside the registry directory for changes.
	 */
	public watch(
		services: Map<
			string,
			{
				classNames: Set<string>;
				entrypoints: Set<string | undefined>;
			}
		>
	): void {
		if (services.size === 0 || !this.registryPath) {
			return;
		}

		// Keep track of external services we are depending on
		// To pre-populate the proxy server with the fallback service addresses
		this.externalServices = new Map(services);

		if (!this.watcher) {
			this.watcher = watch(this.registryPath).on("all", () => this.refresh());
			this.refresh();
		}
	}

	/**
	 * Initialize the worker thread proxy server
	 */
	public async initializeProxyWorker(): Promise<string | null> {
		if (!this.isEnabled()) {
			return null;
		}

		if (this.proxyAddress !== undefined) {
			this.log.debug("Dev registry proxy is already running");
			return this.proxyAddress;
		}

		const worker = new Worker(
			path.join(__dirname, "shared", "dev-registry.worker.js")
		);

		// Wait for the worker to signal it's ready and provide the port
		const address = await new Promise<string>((resolve, reject) => {
			worker.once("message", (message) => {
				if (message.type === "ready") {
					resolve(message.address);
				} else if (message.type === "error") {
					reject(new Error(message.error));
				}
			});
			worker.once("error", reject);
		});

		this.proxyWorker = worker;
		this.proxyAddress = address;
		this.log.debug(`Dev registry proxy started on http://${address}`);

		return address;
	}

	/**
	 * Unregister all managed workers and close the watcher.
	 * This is a sync function that returns a promise
	 * to ensure all workers are unregistered within the exit hook
	 */
	public dispose(): Promise<void> | undefined {
		this.unregisterWorkers();
		this.registry = {};

		// Only this step is async and could be awaited
		return Promise.all([this.watcher?.close(), this.proxyWorker?.terminate()])
			.then(() => {
				// Typescript complains that the return type is
				// not compatible with `Promise<void>` without this.
				return;
			})
			.finally(() => {
				this.watcher = undefined;
				this.proxyWorker = undefined;
				this.proxyAddress = undefined;
			});
	}

	private unregisterWorkers() {
		for (const worker of this.registeredWorkers) {
			this.unregister(worker);
		}

		this.registeredWorkers.clear();
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
		} catch (e) {
			this.log?.debug(`Failed to unregister worker "${name}": ${e}`);
		}
	}

	public isEnabled(): boolean {
		return this.registryPath !== undefined && this.registryPath !== "";
	}

	public isDurableObjectProxyEnabled(): boolean {
		return this.isEnabled() && this.enableDurableObjectProxy;
	}

	public async updateRegistryPath(
		registryPath: string | undefined,
		enableDurableObjectProxy: boolean,
		onUpdate?: (registry: WorkerRegistry) => void
	): Promise<void> {
		// Unregister all registered workers
		this.unregisterWorkers();
		this.enableDurableObjectProxy = enableDurableObjectProxy;
		this.onUpdate = onUpdate;

		if (registryPath !== this.registryPath) {
			// Close the existing watcher if it exists.
			// It will watch the new path if there is any dependent services in a later step
			await this.watcher?.close();

			this.watcher = undefined;
			this.registryPath = registryPath;
		}
	}

	public configureProxyWorker(
		runtimeEntryURL: string,
		socketPorts: SocketPorts
	) {
		if (!this.proxyWorker) {
			return;
		}

		const fallbackServicePorts: Record<string, Record<string, number>> = {};

		for (const [service, { entrypoints }] of this.externalServices) {
			for (const entrypoint of entrypoints) {
				const port = socketPorts.get(
					getProxyFallbackServiceSocketName(service, entrypoint)
				);

				if (!port) {
					throw new Error(
						`There is no socket opened for "${service}" with the "${entrypoint ?? "default"}" entrypoint`
					);
				}

				fallbackServicePorts[service] ??= {};
				fallbackServicePorts[service][entrypoint ?? "default"] = port;
			}
		}

		// Send updated config to the proxy worker
		this.proxyWorker.postMessage({
			type: "setup",
			runtimeEntryURL,
			fallbackServicePorts,
		});
	}

	public register(workers: Record<string, WorkerDefinition>) {
		if (!this.registryPath) {
			return;
		}

		// Make sure the registry path exists
		mkdirSync(this.registryPath, { recursive: true });

		for (const [name, definition] of Object.entries(workers)) {
			const definitionPath = path.join(this.registryPath, name);
			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}

			// Skip the durable objects in the definition if the proxy is not enabled
			if (!this.enableDurableObjectProxy) {
				definition.durableObjects = [];
			}

			writeFileSync(definitionPath, JSON.stringify(definition, null, 2));
			this.registeredWorkers.add(name);
			this.heartbeats.set(
				name,
				setInterval(() => {
					if (existsSync(definitionPath)) {
						utimesSync(definitionPath, new Date(), new Date());
					}
				}, 30_000)
			);
		}
	}

	private refresh(): void {
		if (!this.registryPath) {
			return;
		}

		const registry = getWorkerRegistry(this.registryPath, (workerName) => {
			this.unregister(workerName);
		});

		// Only trigger callback if there are actual changes to services we care about
		if (this.onUpdate) {
			// Check only external services (ones we're bound to) for changes
			// This prevents unnecessary callback triggers for unrelated registry updates
			for (const [service] of this.externalServices) {
				if (
					JSON.stringify(registry[service]) !==
					JSON.stringify(this.registry[service])
				) {
					// A service we depend on has changed, notify listeners
					// Provide a deep copy to prevent accidental mutations by consumers
					this.onUpdate(JSON.parse(JSON.stringify(registry)));
					break;
				}
			}
		}

		// Send updated workers to the proxy worker
		if (this.proxyWorker) {
			this.proxyWorker.postMessage({
				type: "update",
				workers: registry,
			});
		}

		// Update our cached registry state
		this.registry = registry;
	}
}

/**
 * Read the worker registry from the specified path.
 *
 * This function reads the worker definitions from the registry directory, and skips any stale
 * workers that have not been updated in the last 5 minutes. If a worker is stale, it will call
 * the `unregisterStaleWorker` callback if provided.
 */
export function getWorkerRegistry(
	registryPath: string,
	unregisterStaleWorker?: (workerName: string) => void
): WorkerRegistry {
	const registry: WorkerRegistry = {};

	if (!existsSync(registryPath)) {
		return registry;
	}

	for (const workerName of readdirSync(registryPath)) {
		try {
			const definitionPath = path.join(registryPath, workerName);
			const file = readFileSync(definitionPath, "utf8");
			const stats = statSync(definitionPath);

			// Cleanup old workers that have not sent a heartbeat in over 5 minutes
			if (stats.mtime.getTime() < Date.now() - 300_000) {
				unregisterStaleWorker?.(workerName);
				continue;
			}

			registry[workerName] = JSON.parse(file);
		} catch {
			// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel process
		}
	}

	return registry;
}

/**
 * Get the default path for the dev registry.
 * This is used by both Wrangler and the Vite plugin to ensure they use the same path.
 */
export function getDefaultDevRegistryPath() {
	return (
		process.env.MINIFLARE_REGISTRY_PATH ??
		path.join(getGlobalWranglerConfigPath(), "registry")
	);
}
