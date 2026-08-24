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
import { randomUUID } from "node:crypto";
import type { Log } from "./log";
import type { FSWatcher } from "chokidar";

export const STORAGE_CANDIDATE_PREFIX = "__miniflare_storage_candidate__-";
const STORAGE_CANDIDATE_HEARTBEAT_MS = 2_000;
const STORAGE_CANDIDATE_STALE_MS = 10_000;
const WORKER_HEARTBEAT_MS = 10_000;
const WORKER_STALE_MS = 90_000;

export function getStorageCandidateName(instanceId: string): string {
	return `${STORAGE_CANDIDATE_PREFIX}${instanceId}`;
}

export function isStorageCandidateName(name: string): boolean {
	return name.startsWith(STORAGE_CANDIDATE_PREFIX);
}

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registrationRetries = new Map<string, NodeJS.Timeout>();
	private registeredWorkers: Set<string> = new Set();
	private storageCandidateRefresh: NodeJS.Timeout | undefined;
	private watchQueueConsumers = false;
	private watchStorageCandidates = false;
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
		watchQueueConsumers = false,
		watchStorageCandidates = false
	): void {
		if (
			(services.size === 0 &&
				!watchQueueConsumers &&
				!watchStorageCandidates) ||
			!this.registryPath
		) {
			return;
		}

		this.externalServices = new Map(services);
		this.watchQueueConsumers = watchQueueConsumers;
		this.watchStorageCandidates = watchStorageCandidates;
		if (watchStorageCandidates && this.storageCandidateRefresh === undefined) {
			this.storageCandidateRefresh = setInterval(
				() => this.refresh(),
				STORAGE_CANDIDATE_HEARTBEAT_MS
			);
		}

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
		if (this.storageCandidateRefresh !== undefined) {
			clearInterval(this.storageCandidateRefresh);
			this.storageCandidateRefresh = undefined;
		}

		// Only this step is async and could be awaited
		return this.watcher?.close().finally(() => {
			this.watcher = undefined;
		});
	}

	/**
	 * Withdraw every entry this instance has registered.
	 */
	public unregisterWorkers() {
		for (const retry of this.registrationRetries.values()) {
			clearTimeout(retry);
		}
		this.registrationRetries.clear();

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
				const definitionPath = path.join(this.registryPath, name);
				const definition = readDefinition(definitionPath);
				if (definition?.instanceId === this.instanceId) {
					unlinkSync(definitionPath);
				}
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
			if (this.storageCandidateRefresh !== undefined) {
				clearInterval(this.storageCandidateRefresh);
				this.storageCandidateRefresh = undefined;
			}

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
		for (const retry of this.registrationRetries.values()) {
			clearTimeout(retry);
		}
		this.registrationRetries.clear();

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
			this.registerWorker(name, definition);
		}
		this.refresh();
	}

	private writeWorkerDefinition(
		definitionPath: string,
		definition: WorkerDefinition
	): void {
		writeFileSync(
			definitionPath,
			JSON.stringify({ ...definition, instanceId: this.instanceId }, null, 2)
		);
	}

	private registerWorker(name: string, definition: WorkerDefinition): void {
		assert(this.registryPath);
		const definitionPath = path.join(this.registryPath, name);

		const stats = statSync(definitionPath, { throwIfNoEntry: false });

		const oldDefinition = stats ? readDefinition(definitionPath) : undefined;
		const staleMs = isStorageCandidateName(name)
			? STORAGE_CANDIDATE_STALE_MS
			: WORKER_STALE_MS;
		if (stats && stats.mtime.getTime() < Date.now() - staleMs) {
			try {
				unlinkSync(definitionPath);
			} catch {}
		} else if (stats && oldDefinition?.instanceId !== this.instanceId) {
			// Debug rather than warn: a non-graceful exit leaves an entry behind, so
			// this fires routinely on restart. Registration is rescheduled for when
			// that entry expires, and keeps retrying while another process holds the
			// name.
			this.log.debug(
				`Skipping registration of Worker ${name} as a Worker with this name is already registered in the dev registry by another process`
			);
			const retryDelay = Math.max(
				1,
				stats.mtime.getTime() + staleMs - Date.now()
			);
			this.registrationRetries.set(
				name,
				setTimeout(() => {
					this.registrationRetries.delete(name);
					this.registerWorker(name, definition);
					this.refresh();
				}, retryDelay)
			);
			return;
		}

		const retry = this.registrationRetries.get(name);
		if (retry !== undefined) {
			clearTimeout(retry);
			this.registrationRetries.delete(name);
		}

		const existingHeartbeat = this.heartbeats.get(name);
		if (existingHeartbeat) {
			clearInterval(existingHeartbeat);
		}

		this.writeWorkerDefinition(definitionPath, definition);
		this.registeredWorkers.add(name);
		this.heartbeats.set(
			name,
			setInterval(
				() => {
					if (!existsSync(definitionPath)) {
						// Stale cleanup may remove a live Worker's entry after system sleep.
						// Recreate it so peers can discover this Worker again.
						try {
							this.writeWorkerDefinition(definitionPath, definition);
						} catch (e) {
							this.log.debug(`Failed to re-register Worker "${name}": ${e}`);
						}
						return;
					}

					const currentDefinition = readDefinition(definitionPath);
					if (currentDefinition?.instanceId === this.instanceId) {
						utimesSync(definitionPath, new Date(), new Date());
					} else {
						const heartbeat = this.heartbeats.get(name);
						if (heartbeat !== undefined) {
							clearInterval(heartbeat);
							this.heartbeats.delete(name);
						}
					}
				},
				isStorageCandidateName(name)
					? STORAGE_CANDIDATE_HEARTBEAT_MS
					: WORKER_HEARTBEAT_MS
			)
		);
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
		if (
			this.watchStorageCandidates &&
			getStorageCandidatesView(registry) !==
				getStorageCandidatesView(previousRegistry)
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

function getStorageCandidatesView(registry: WorkerRegistry): string {
	return JSON.stringify(
		Object.entries(registry)
			.filter(([name]) => isStorageCandidateName(name))
			.map(([name, definition]) => [
				name,
				definition.instanceId,
				definition.debugPortAddress,
				definition.storageScope,
				definition.created,
			])
			.sort(([previousName], [nextName]) =>
				String(previousName).localeCompare(String(nextName))
			)
	);
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
 * Skips stale workers that haven't sent a heartbeat within their stale window,
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

			if (stats === undefined) {
				continue;
			}
			const definition = readDefinition(definitionPath);
			if (definition === undefined) {
				continue;
			}
			const staleMs = isStorageCandidateName(workerName)
				? STORAGE_CANDIDATE_STALE_MS
				: WORKER_STALE_MS;
			if (stats.mtime.getTime() < Date.now() - staleMs) {
				try {
					unlinkSync(definitionPath);
				} catch {}
				continue;
			}

			registry[workerName] = {
				...definition,
				created: stats.birthtimeMs,
			};
		} catch {
			// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel process
		}
	}

	return registry;
}

function readDefinition(
	definitionPath: string
): (WorkerDefinition & { instanceId?: string }) | undefined {
	try {
		const value: unknown = JSON.parse(
			readFileSync(definitionPath, { encoding: "utf8", flag: "r" })
		);
		if (typeof value === "object" && value !== null) {
			return value as WorkerDefinition & { instanceId?: string };
		}
	} catch {}
	return undefined;
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
