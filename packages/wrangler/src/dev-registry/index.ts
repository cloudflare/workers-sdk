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
		tailConsumers,
		dispatchNamespaces,
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
		tailConsumers: Config["tail_consumers"] | undefined;
		dispatchNamespaces: Config["dispatch_namespaces"] | undefined;
	},
	existingWorkerDefinitions?: WorkerRegistry | undefined
): Promise<WorkerRegistry | undefined> {
	const serviceNames = [...(services || []), ...(tailConsumers ?? [])].map(
		(serviceBinding) => serviceBinding.service
	);
	const durableObjectServices = (
		durableObjects || { bindings: [] }
	).bindings.map((durableObjectBinding) => durableObjectBinding.script_name);

	const dispatchNamespacesNames = (dispatchNamespaces || []).map(
		(dispatchNamespaceBinding) => dispatchNamespaceBinding.namespace
	);

	const dispatchOutboundServices = (dispatchNamespaces || []).map(
		(dispatchNamespaceBinding) => dispatchNamespaceBinding.outbound?.service
	);

	if (
		serviceNames.length === 0 &&
		durableObjectServices.length === 0 &&
		dispatchNamespacesNames.length === 0 &&
		dispatchOutboundServices.length === 0
	) {
		return {};
	}
	const workerDefinitions =
		existingWorkerDefinitions ?? (await getRegisteredWorkers());

	const filteredWorkers = Object.fromEntries(
		Object.entries(workerDefinitions || {}).filter(
			([key, value]) =>
				key !== name && // Always exclude current worker to avoid infinite loops
				(serviceNames.includes(key) ||
					durableObjectServices.includes(key) ||
					dispatchOutboundServices.includes(key) ||
					(value.dispatchNamespace &&
						dispatchNamespacesNames.includes(value.dispatchNamespace)))
		)
	);
	return filteredWorkers;
}

export async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	return FileRegistry.devRegistry(cb);
}
