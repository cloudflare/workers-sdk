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
import { version as wranglerVersion } from "../../package.json";
import { getRegistryPath } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import type { WorkerDefinition, WorkerRegistry } from "./types";

const DEV_REGISTRY_PATH = getRegistryPath();

export class DevRegistry {
	heartbeats: Map<string, NodeJS.Timeout>;
	workers: WorkerRegistry | undefined;
	watcher: ReturnType<typeof watch> | undefined;
	registryPath: string;

	constructor(registryPath: string) {
		this.registryPath = registryPath;
		this.heartbeats = new Map<string, NodeJS.Timeout>();
		this.workers = {};
	}

	/**
	 * Start the service registry. It's a simple server
	 * that exposes endpoints for registering and unregistering
	 * services, as well as getting the state of the registry.
	 */
	async start(
		callback?: (registry: WorkerRegistry | undefined) => void
	): Promise<void> {
		await this.refresh();

		callback?.({ ...this.workers });

		this.watcher ??= watch(this.registryPath, {
			persistent: true,
		}).on("all", async () => {
			await this.refresh();
			callback?.({ ...this.workers });
		});
	}

	/**
	 * Stop the service registry.
	 */
	async stop(): Promise<void> {
		if (this.watcher) {
			await this.watcher.close();

			for (const heartbeat of this.heartbeats) {
				clearInterval(heartbeat[1]);
			}

			this.heartbeats.clear();
			this.watcher = undefined;
		}
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
			// We don't currently do anything with the stored Wrangler version,
			// but if we need to make breaking changes to this format in the future
			// we can use this field to present useful messaging
			JSON.stringify({ ...definition, wranglerVersion }, null, 2)
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
			logger.debug("failed to unregister worker", e);
		}
	}

	/**
	 * Get the state of the service registry.
	 */
	async getWorkers(): Promise<WorkerRegistry> {
		return this.refresh();
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
				logger.debug(
					"Error while loading worker definition from the registry",
					e
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

export const fileRegistry = new DevRegistry(DEV_REGISTRY_PATH);
