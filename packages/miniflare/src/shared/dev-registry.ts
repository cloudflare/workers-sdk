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
	/** Address of the workerd debug port for this worker's process (e.g. "127.0.0.1:12345").
	 * The debug port provides native Cap'n Proto RPC access to all services/entrypoints. */
	debugPortAddress: string;
	/** The workerd service name for the default entrypoint. This varies by worker type:
	 * - Workers with assets: routes through the assets RPC proxy
	 * - Vite workers: routes through the vite proxy worker
	 * - Plain workers: routes directly to the user worker service */
	defaultEntrypointService: string;
	/** The workerd service name for the user worker directly (always "core:user:${name}").
	 * Used for named entrypoints and Durable Object access, which must bypass
	 * any assets/vite proxy layer. */
	userWorkerService: string;
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

	constructor(
		private registryPath: string | undefined,
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

		// Track external services we depend on to detect relevant registry changes
		this.externalServices = new Map(services);

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
		return this.watcher
			?.close()
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

	/** Returns the filesystem path for the dev registry directory, or undefined if disabled. */
	public getRegistryPath(): string | undefined {
		return this.registryPath;
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
			const stats = statSync(definitionPath, { throwIfNoEntry: false });

			// Cleanup old workers that have not sent a heartbeat in over 5 minutes
			if (stats === undefined || stats.mtime.getTime() < Date.now() - 300_000) {
				unregisterStaleWorker?.(workerName);
				continue;
			}

			const file = readFileSync(definitionPath, {
				encoding: "utf8",
				flag: "r",
			});
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
