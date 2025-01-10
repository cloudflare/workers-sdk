import { FileRegistry } from "./file-registry";
import type { Binding } from "../api";
import type { Config } from "../config";
import type {
	WorkerDefinition,
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "./types";

export type { WorkerDefinition, WorkerRegistry, WorkerEntrypointsDefinition };

/**
 * Start the service registry. It's a simple server
 * that exposes endpoints for registering and unregistering
 * services, as well as getting the state of the registry.
 */
export async function startWorkerRegistry(
	listener?: (registry: WorkerRegistry | undefined) => void
) {
	return FileRegistry.startWorkerRegistry(listener);
}

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	return FileRegistry.stopWorkerRegistry();
}

/**
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	return FileRegistry.registerWorker(name, definition);
}

/**
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<
	WorkerRegistry | undefined
> {
	return FileRegistry.getRegisteredWorkers();
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
	return FileRegistry.devRegistry(cb);
}
