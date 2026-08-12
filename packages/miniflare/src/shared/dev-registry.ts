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
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { watch } from "chokidar";
import type { WorkerDefinition, WorkerRegistry } from "./dev-registry-types";
export type { WorkerDefinition, WorkerRegistry };
import type { Log } from "./log";
import type { FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registeredWorkers: Set<string> = new Set();
	private watchQueueConsumers = false;
	private externalServices: Map<
		string,
		{
			classNames: Set<string>;
			entrypoints: Set<string | undefined>;
		}
	> = new Map();
	private watcher: FSWatcher | undefined;

	// UUID to let us tell whether a dev registry entry was added by _this_ Miniflare process
	public instanceId: string;

	constructor(
		private registryPath: string | undefined,
		private onUpdate: ((registry: WorkerRegistry) => void) | undefined,
		private log: Log
	) {
		this.instanceId = randomUUID();
	}

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
		>,
		watchQueueConsumers = false
	): void {
		if ((services.size === 0 && !watchQueueConsumers) || !this.registryPath) {
			return;
		}

		this.externalServices = new Map(services);
		this.watchQueueConsumers = watchQueueConsumers;

		mkdirSync(this.registryPath, { recursive: true });

		if (!this.watcher) {
			this.watcher = watch(this.registryPath, {
				// On Windows, chokidar's default `fs.watch` backend
				// (`ReadDirectoryChangesW`) frequently drops or delays create
				// events for files added shortly after the watcher attaches —
				// especially under CI virtualization. Fall back to polling on
				// Windows so cross-process worker registrations are observed
				// reliably. The registry directory is small, so the cost is
				// negligible.
				usePolling: process.platform === "win32",
				interval: 100,
			}).on("all", () => {
				this.refresh();
			});
		}
	}

	/**
	 * Unregister all managed workers and close the watcher.
	 * This is a sync function that returns a promise
	 * to ensure all workers are unregistered within the exit hook
	 */
	public dispose(): Promise<void> | undefined {
		this.unregisterWorkers();

		// Only this step is async and could be awaited
		return this.watcher?.close().finally(() => {
			this.watcher = undefined;
		});
	}

	/**
	 * Withdraw every entry this instance has registered.
	 */
	public unregisterWorkers() {
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

	public getRegistry(): WorkerRegistry {
		if (!this.registryPath) {
			return {};
		}
		return getWorkerRegistry(this.registryPath);
	}

	public getRegistryPath(): string | undefined {
		return this.registryPath;
	}

	public async updateRegistryPath(
		registryPath: string | undefined,
		onUpdate?: (registry: WorkerRegistry) => void
	): Promise<void> {
		this.onUpdate = onUpdate;

		if (registryPath !== this.registryPath) {
			// Our entries live in the directory we are leaving, so they have to be
			// removed from there before we switch. When the path is unchanged we
			// deliberately keep them: `register()` reconciles the set instead, so a
			// config update no longer deletes and recreates every entry. Other dev
			// sessions watch this directory, and a deletion is visible to them even
			// if we put the file straight back.
			this.unregisterWorkers();

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

		// Drop the entries for Workers this instance no longer has. Workers that
		// remain are overwritten in place below instead of being deleted and
		// recreated, so a peer never observes one of its service binding or
		// `tail_consumers` targets disappearing during a routine config update.
		for (const name of [...this.registeredWorkers]) {
			// `hasOwn` rather than `in`: a Worker may legitimately be named after an
			// inherited property such as `constructor`, and `in` would report it as
			// still present and leave its entry behind.
			if (!Object.hasOwn(workers, name)) {
				this.unregister(name);
				this.registeredWorkers.delete(name);
			}
		}

		for (const [name, definition] of Object.entries(workers)) {
			const definitionPath = path.join(this.registryPath, name);

			const stats = statSync(definitionPath, { throwIfNoEntry: false });

			// Cleanup old workers that have not sent a heartbeat in over 5 minutes
			if (stats && stats.mtime.getTime() < Date.now() - 300_000) {
				try {
					unlinkSync(definitionPath);
				} catch {}
				continue;
			} else if (stats) {
				const file = readFileSync(definitionPath, {
					encoding: "utf8",
					flag: "r",
				});
				const oldDefinition = JSON.parse(file);

				// Skip registration if the instance ID is different
				if (oldDefinition.instanceId !== this.instanceId) {
					this.log.warn(
						`Skipping registration of Worker ${name} as a Worker with this name is already registered in the dev registry by another process`
					);
					continue;
				}
			}

			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}

			writeFileSync(
				definitionPath,
				JSON.stringify({ ...definition, instanceId: this.instanceId }, null, 2)
			);
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
		this.refresh();
	}

	private previousJSON = "{}";
	private refresh(): void {
		if (!this.onUpdate) {
			return;
		}

		assert(this.registryPath);
		const registry = getWorkerRegistry(this.registryPath);
		const json = JSON.stringify(registry);
		if (json === this.previousJSON) {
			return;
		}
		const previousRegistry = JSON.parse(this.previousJSON);
		this.previousJSON = json;
		// Queue consumers may be advertised by any worker in the registry (their
		// names aren't known upfront), so compare the queue-consumer view of the
		// whole registry rather than specific entries.
		if (
			this.watchQueueConsumers &&
			getQueueConsumersView(registry) !==
				getQueueConsumersView(previousRegistry)
		) {
			this.onUpdate(registry);
			return;
		}
		for (const [service] of this.externalServices) {
			if (
				JSON.stringify(registry[service]) !==
				JSON.stringify(previousRegistry[service])
			) {
				this.onUpdate(registry);
				break;
			}
		}
	}
}

/**
 * Serialise the parts of the registry that matter for routing cross-process
 * queue messages: which workers consume which queues, and the debug address
 * each can be reached on (see `findQueueConsumer`).
 */
function getQueueConsumersView(registry: WorkerRegistry): string {
	return JSON.stringify(
		Object.entries(registry)
			.filter(([, definition]) => definition.queueConsumers !== undefined)
			.map(
				([workerName, definition]) =>
					[
						workerName,
						definition.debugPortAddress,
						definition.queueConsumers,
					] as const
			)
			.sort(([previousWorkerName], [nextWorkerName]) =>
				previousWorkerName.localeCompare(nextWorkerName)
			)
	);
}

/**
 * Read the worker registry from the specified path.
 *
 * Skips stale workers that haven't sent a heartbeat in over 5 minutes,
 * and removes their files from disk.
 */
export function getWorkerRegistry(registryPath: string): WorkerRegistry {
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
				try {
					unlinkSync(definitionPath);
				} catch {}
				continue;
			}

			const file = readFileSync(definitionPath, {
				encoding: "utf8",
				flag: "r",
			});
			registry[workerName] = {
				...JSON.parse(file),
				created: stats.birthtimeMs,
			};
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
		path.join(getGlobalConfigPath(), "registry")
	);
}
