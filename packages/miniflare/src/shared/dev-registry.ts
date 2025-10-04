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
import { FSWatcher, watch } from "chokidar";
import { Log } from "./log";
import { getGlobalWranglerConfigPath } from "./wrangler";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerDefinition = {
	origin: string;
	durableObjects: { className: string }[];
	entrypoints: string[];
};

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registry: WorkerRegistry = {};
	private registeredWorkers: Set<string> = new Set();
	private externalServices: Set<string> = new Set();
	private watcher: FSWatcher | undefined;

	constructor(
		private registryPath: string | undefined,
		private onUpdate: ((registry: WorkerRegistry) => void) | undefined,
		private log: Log
	) {
		if (registryPath) {
			// Make sure the registry path exists
			mkdirSync(registryPath, { recursive: true });
		}
	}

	/**
	 * Watch files inside the registry directory for changes.
	 */
	public watch(services: Set<string>): void {
		if (services.size === 0 || !this.registryPath) {
			return;
		}

		// Keep track of external services we are depending on
		this.externalServices = services;

		if (!this.watcher) {
			this.watcher = watch(this.registryPath).on("all", () => this.refresh());
			this.refresh();
		}
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
		return Promise.all([this.watcher?.close()])
			.then(() => {
				// Typescript complains that the return type is
				// not compatible with `Promise<void>` without this.
				return;
			})
			.finally(() => {
				this.watcher = undefined;
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

	public async updateRegistryPath(
		registryPath: string | undefined,
		onUpdate?: (registry: WorkerRegistry) => void
	): Promise<void> {
		// Unregister all registered workers
		this.unregisterWorkers();
		this.onUpdate = onUpdate;

		if (registryPath !== this.registryPath) {
			// Close the existing watcher if it exists.
			// It will watch the new path if there is any dependent services in a later step
			await this.watcher?.close();

			this.watcher = undefined;
			this.registryPath = registryPath;
		}
	}

	public register(
		exposeOverRegistry: Map<string, Omit<WorkerDefinition, "origin">>,
		origin: string
	) {
		if (!this.registryPath) {
			return;
		}

		for (const [name, partialDefinition] of exposeOverRegistry) {
			const definition = {
				...partialDefinition,
				origin,
			} satisfies WorkerDefinition;

			const definitionPath = path.join(this.registryPath, name);
			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
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
			for (const service of this.externalServices) {
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
