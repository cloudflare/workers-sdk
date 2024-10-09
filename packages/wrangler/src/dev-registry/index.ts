import path from "path";
import { getFlag } from "../experimental-flags";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import { logger } from "../logger";
import { FilesystemWorkerRegistry } from "./FilesystemWorkerRegistry";
import { serverWorkerRegistry } from "./server-worker-registry";
import type { Binding } from "../api";
import type { Config } from "../config";
import type {
	WorkerDefinition,
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "./types";

export type { WorkerDefinition, WorkerRegistry, WorkerEntrypointsDefinition };

const filesystemWorkerRegistry = new FilesystemWorkerRegistry(
	path.join(getGlobalWranglerConfigPath(), "registry"),
	logger
);

export const startWorkerRegistryServer =
	serverWorkerRegistry.startWorkerRegistryServer;

/**
 * Start the service registry. It's a simple server
 * that exposes endpoints for registering and unregistering
 * services, as well as getting the state of the registry.
 */
export async function startWorkerRegistry(
	listener?: (registry: WorkerRegistry | undefined) => void
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.startRegistryWatcher(listener);
	}

	return serverWorkerRegistry.startWorkerRegistry();
}

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.stopRegistryWatcher();
	}
	return serverWorkerRegistry.stopWorkerRegistry();
}

/**
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.registerWorker(name, definition);
	}
	return serverWorkerRegistry.registerWorker(name, definition);
}

/**
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<
	WorkerRegistry | undefined
> {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.getRegisteredWorkers();
	}

	return serverWorkerRegistry.getRegisteredWorkers();
}

/**
 * A function that takes your serviceNames and durableObjectNames and returns a
 * list of the running workers that we're bound to.
 */
export async function getBoundRegisteredWorkers(
	worker: {
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
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.getBoundRegisteredWorkers(
			worker,
			existingWorkerDefinitions
		);
	}

	return serverWorkerRegistry.getBoundRegisteredWorkers(
		worker,
		existingWorkerDefinitions
	);
}

/**
 * A managed way to start and stop watchers on the registry.
 * Starts the watcher when called, and returns a cleanup function that stops the watcher and
 * unregisters the worker that is provided to it.
 *
 * @example
 * const cleanup = await devRegistry(onRegistryChangeCallback);
 *
 * ...
 *
 * cleanup('worker-name');
 */
export async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return filesystemWorkerRegistry.devRegistry(cb);
	}

	return serverWorkerRegistry.devRegistry(cb);
}
