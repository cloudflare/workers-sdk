import { getFlag } from "../experimental-flags";
import { FileRegistry } from "./file-registry";
import { ServerRegistry } from "./server-registry";
import type { Binding } from "../api";
import type { Config } from "../config";
import type {
	WorkerDefinition,
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "./types";

export type { WorkerDefinition, WorkerRegistry, WorkerEntrypointsDefinition };

// Safety of `!`: `parseInt(undefined)` is NaN
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
let DEV_REGISTRY_PORT = parseInt(process.env.WRANGLER_WORKER_REGISTRY_PORT!);
if (Number.isNaN(DEV_REGISTRY_PORT)) {
	DEV_REGISTRY_PORT = 6284;
}

export const startWorkerRegistryServer =
	ServerRegistry.startWorkerRegistryServer;

/**
 * Start the service registry. It's a simple server
 * that exposes endpoints for registering and unregistering
 * services, as well as getting the state of the registry.
 */
export async function startWorkerRegistry(
	listener?: (registry: WorkerRegistry | undefined) => void
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.startWorkerRegistry(listener);
	}

	return ServerRegistry.startWorkerRegistry();
}

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.stopWorkerRegistry();
	}
	return ServerRegistry.stopWorkerRegistry();
}

/**
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.registerWorker(name, definition);
	}
	return ServerRegistry.registerWorker(name, definition);
}

/**
 * Unregister a worker from the registry.
 */
export async function unregisterWorker(name: string) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.unregisterWorker(name);
	}
	return ServerRegistry.unregisterWorker(name);
}

/**
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<
	WorkerRegistry | undefined
> {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.getRegisteredWorkers();
	}

	return ServerRegistry.getRegisteredWorkers();
}

/**
 * a function that takes your serviceNames and durableObjectNames and returns a
 * list of the running workers that we're bound to
 */
export async function getBoundRegisteredWorkers(
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
		existingWorkerDefinitions ?? (await getRegisteredWorkers());

	const filteredWorkers = Object.fromEntries(
		Object.entries(workerDefinitions || {}).filter(
			([key, _value]) =>
				key !== name && // Always exclude current worker to avoid infinite loops
				(serviceNames.includes(key) || durableObjectServices.includes(key))
		)
	);
	return filteredWorkers;
}

export async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	if (getFlag("FILE_BASED_REGISTRY")) {
		return FileRegistry.devRegistry(cb);
	}

	return ServerRegistry.devRegistry(cb);
}
