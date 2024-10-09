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
import * as util from "node:util";
import { watch } from "chokidar";
import { version as wranglerVersion } from "../../package.json";
import { logger as defaultLogger } from "../logger";
import type { Binding } from "../api";
import type { Config } from "../config";
import type { Logger } from "../logger";
import type { Registry, WorkerDefinition, WorkerRegistry } from "./types";

/**
 * FilesystemWorkerRegistry manages Worker registrations using the local filesystem.
 *
 * This class provides a mechanism for registering, unregistering, and monitoring
 * Workers in a development environment. It uses the filesystem to store Worker definitions
 * and implements a heartbeat system to ensure Worker liveliness (dead Workers are removed
 * from the registry). It enables testing of multiple Workers simultaneously
 *
 * How it works:
 * 1. Worker definitions are stored as JSON files in a specified registry directory.
 * 2. A heartbeat system updates each Worker's file (mtime) timestamp every 30 seconds.
 * 3. Workers with timestamps older than 10 minutes are considered inactive and removed.
 * 4. File watchers are used to detect changes in the registry directory.
 *
 * @example
 * ```typescript
 * const logger = new Logger();
 * const registry = new FilesystemWorkerRegistry('./worker-registry', logger);
 *
 * // Register a Worker
 * await registry.registerWorker('my-worker', {
 *   port: 8787,
 *   protocol: 'https',
 *   host: 'localhost'
 * });
 *
 * // Get all registered Workers
 * const workers = await registry.getRegisteredWorkers();
 *
 * // Start watching the registry for changes
 * await registry.devRegistry((updatedWorkers) => {
 *   console.log('Workers updated:', updatedWorkers);
 * });
 *
 * // Unregister a Worker
 * await registry.unregisterWorker('my-worker');
 * ```
 */
export class FilesystemWorkerRegistry implements Registry {
	/**
	 * Heartbeats are used to keep worker registrations "alive" and to detect when a Worker is no longer active.

	 * - Every 30 seconds (30,000 milliseconds), the heartbeat updates the modification time (mtime) of the Worker's file in the registry directory.
	 * - When we try to get a list of workers (loadWorkerDefinitions), if a Worker file hasn't been updated in the
	 *   last 10 minutes (600,000 milliseconds), it's considered inactive and is unregistered.
	 */
	#heartbeats: Map<string, NodeJS.Timeout>;
	#globalWorkers: WorkerRegistry | undefined;
	#globalWatcher: ReturnType<typeof watch> | undefined;
	readonly #logger: Logger;
	#registryPath: string;

	constructor(registryPath: string, logger = defaultLogger) {
		this.#heartbeats = new Map<string, NodeJS.Timeout>();
		this.#globalWorkers = undefined;
		this.#globalWatcher = undefined;
		this.#logger = logger;
		this.#registryPath = registryPath;
	}

	/**
	 * Initializes and manages the development registry, watching for changes and notifying via callback.
	 *
	 * How it works:
	 * 1. Starts a file watcher on the registry directory.
	 * 2. Calls the provided callback whenever changes are detected.
	 * 3. Returns a cleanup function to stop watching and unregister Workers.
	 *
	 * @example
	 * ```typescript
	 * const cleanup = await registry.devRegistry((updatedWorkers) => {
	 *   console.log('Workers updated:', updatedWorkers);
	 * });
	 *
	 * // Later, to clean up:
	 * await cleanup();
	 * ```
	 */
	async devRegistry(
		cb: (workers: WorkerRegistry | undefined) => void
	): Promise<(name?: string) => Promise<void>> {
		let previousRegistry: WorkerRegistry | undefined;

		await this.startRegistryWatcher(async (registry) => {
			if (!util.isDeepStrictEqual(registry, previousRegistry)) {
				previousRegistry = registry;
				cb(registry);
			}
		});

		return async (name?: string) => {
			try {
				const [unregisterResult, stopRegistryResult] = await Promise.allSettled(
					[
						name ? this.unregisterWorker(name) : Promise.resolve(),
						this.stopRegistryWatcher(),
					]
				);
				if (unregisterResult.status === "rejected") {
					this.#logger.error(
						"Failed to unregister Worker",
						unregisterResult.reason
					);
				}
				if (stopRegistryResult.status === "rejected") {
					this.#logger.error(
						"Failed to stop Worker registry",
						stopRegistryResult.reason
					);
				}
			} catch (err) {
				this.#logger.error("Failed to cleanup dev registry", err);
			}
		};
	}

	/**
	 * Retrieves Workers that are bound to the provided Worker configuration. It filters out
	 * irrelevant Workers based on service bindings and Durable Objects.
	 *
	 * How it works:
	 * 1. Extracts service names and Durable Object script names from the provided configuration.
	 * 2. Filters the existing Worker definitions based on these names.
	 * 3. Returns a subset of Worker definitions that match the criteria.
	 *
	 * @example
	 * ```typescript
	 * const boundWorkers = await registry.getBoundRegisteredWorkers({
	 *   name: 'my-worker',
	 *   services: [{ service: 'service-a' }, { service: 'service-b' }],
	 *   durableObjects: { bindings: [{ script_name: 'durable-obj-1' }] }
	 * });
	 * ```
	 */
	async getBoundRegisteredWorkers(
		{
			name,
			services,
			durableObjects,
		}: {
			name: string | undefined;
			services:
				| Config["services"]
				| Extract<Binding, { type: "service" }>[]
				| undefined;
			durableObjects:
				| Config["durable_objects"]
				| { bindings: Extract<Binding, { type: "durable_object_namespace" }>[] }
				| undefined;
		},
		existingWorkerDefinitions?: WorkerRegistry | undefined
	): Promise<WorkerRegistry | undefined> {
		const serviceNames = (services || []).map(
			(serviceBinding) => serviceBinding.service
		);
		const durableObjectServices = (
			durableObjects || { bindings: [] }
		).bindings.map((durableObjectBinding) => durableObjectBinding.script_name);

		if (serviceNames.length === 0 && durableObjectServices.length === 0) {
			return {};
		}
		const workerDefinitions =
			existingWorkerDefinitions ?? (await this.getRegisteredWorkers());

		const filteredWorkers = Object.fromEntries(
			Object.entries(workerDefinitions || {}).filter(
				([key, _value]) =>
					key !== name &&
					(serviceNames.includes(key) || durableObjectServices.includes(key))
			)
		);
		return filteredWorkers;
	}

	/**
	 * Starts watching the registry directory for changes, allowing for immediate
	 * reactions to Worker additions, removals, or updates.
	 *
	 * How it works:
	 * 1. Sets up a file watcher on the registry directory.
	 * 2. When changes are detected, it reloads Worker definitions.
	 * 3. Calls the optional callback with updated Worker registry.
	 *
	 * @example
	 * ```typescript
	 * await registry.startRegistryWatcher((updatedRegistry) => {
	 *   console.log('Registry updated:', updatedRegistry);
	 * });
	 * ```
	 */
	async startRegistryWatcher(
		cb?: (registry: WorkerRegistry | undefined) => void
	) {
		await this.#loadWorkerDefinitions();
		cb?.({ ...this.#globalWorkers });
		this.#globalWatcher ??= watch(this.#registryPath, {
			persistent: true,
		}).on("all", async () => {
			await this.#loadWorkerDefinitions();
			cb?.({ ...this.#globalWorkers });
		});
		return;
	}

	/**
	 * Stops watching the registry directory and ensures clean up of file watchers and heartbeats.
	 *
	 * How it works:
	 * 1. Closes the global watcher if it exists.
	 * 2. Clears all heartbeat intervals.
	 *
	 * Example:
	 * ```typescript
	 * await registry.stopRegistryWatcher();
	 * ```
	 */
	async stopRegistryWatcher() {
		if (this.#globalWatcher) {
			await this.#globalWatcher?.close();
			for (const heartbeat of this.#heartbeats) {
				clearInterval(heartbeat[1]);
			}
			return;
		}
	}

	/**
	 * Registers a new Worker or updates an existing one in the registry. Sets up a heartbeat to
	 * keep the Worker registration active.
	 *
	 * How it works:
	 * 1. Clears any existing heartbeat for the Worker.
	 * 2. Writes the Worker definition to a file in the registry directory.
	 * 3. Sets up a new heartbeat interval to update the file's timestamp.
	 *
	 * @example
	 * ```typescript
	 * await registry.registerWorker('my-worker', {
	 *   port: 8787,
	 *   protocol: 'https',
	 *   host: 'localhost'
	 * });
	 * ```
	 */
	async registerWorker(name: string, definition: WorkerDefinition) {
		const existingHeartbeat = this.#heartbeats.get(name);
		if (existingHeartbeat) {
			clearInterval(existingHeartbeat);
		}
		await mkdir(this.#registryPath, { recursive: true });
		await writeFile(
			path.join(this.#registryPath, name),
			JSON.stringify({ ...definition, wranglerVersion }, null, 2)
		);

		this.#heartbeats.set(
			name,
			setInterval(() => {
				utimesSync(path.join(this.#registryPath, name), new Date(), new Date());
			}, 30_000)
		);

		return;
	}

	/**
	 * Retrieves all currently registered Workers, providing a snapshot of all active Worker registrations.
	 * Useful for monitoring or managing multiple Workers
	 *
	 * How it works:
	 * 1. Loads worker definitions from the filesystem.
	 * 2. Returns a copy of the global Workers object.
	 *
	 * @example
	 * ```typescript
	 * const workers = await registry.getRegisteredWorkers();
	 * ```
	 */
	async getRegisteredWorkers(): Promise<WorkerRegistry | undefined> {
		this.#globalWorkers = await this.#loadWorkerDefinitions();
		return { ...this.#globalWorkers };
	}

	/**
	 * Unregisters a Worker from the registry and cleans up associated resources like heartbeat intervals.
	 *
	 * How it works:
	 * 1. Deletes the worker's file from the registry directory.
	 * 2. Clears the associated heartbeat interval.
	 *
	 * @example
	 * ```typescript
	 * await registry.unregisterWorker('my-worker');
	 * ```
	 */
	async unregisterWorker(name: string) {
		try {
			await unlink(path.join(this.#registryPath, name));
			const existingHeartbeat = this.#heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}
		} catch (e) {
			this.#logger.debug("failed to unregister worker", e);
		}
		return;
	}

	/**
	 * Loads Worker definitions from the filesystem and updates the global Workers object.
	 *
	 * How it works:
	 * 1. Reads all files in the registry directory.
	 * 2. Parses each file as a worker definition.
	 * 3. Checks file modification times to remove inactive workers.
	 * 4. Updates the global workers object with current definitions.
	 */
	async #loadWorkerDefinitions(): Promise<WorkerRegistry> {
		await mkdir(this.#registryPath, { recursive: true });
		this.#globalWorkers ??= {};
		const newWorkers = new Set<string>();
		const workerDefinitions = await readdir(this.#registryPath);
		for (const workerName of workerDefinitions) {
			try {
				const file = await readFile(
					path.join(this.#registryPath, workerName),
					"utf8"
				);
				const stats = await stat(path.join(this.#registryPath, workerName));
				if (stats.mtime.getTime() < Date.now() - 600000) {
					await this.unregisterWorker(workerName);
				} else {
					this.#globalWorkers[workerName] = JSON.parse(file);
					newWorkers.add(workerName);
				}
			} catch (e) {
				this.#logger.debug(
					"Error while loading Worker definition from the registry",
					e
				);
			}
		}

		for (const worker of Object.keys(this.#globalWorkers)) {
			if (!newWorkers.has(worker)) {
				delete this.#globalWorkers[worker];
			}
		}
		return this.#globalWorkers;
	}
}
