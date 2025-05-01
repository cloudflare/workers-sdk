import * as util from "node:util";
import { logger } from "../logger";
import { fileRegistry } from "./file-registry";
import type { Binding } from "../api";
import type { Config } from "../config";
import type {
	WorkerDefinition,
	WorkerEntrypointsDefinition,
	WorkerRegistry,
} from "./types";

export type { WorkerDefinition, WorkerRegistry, WorkerEntrypointsDefinition };

export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	return fileRegistry.register(name, definition);
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
	},
	existingWorkerDefinitions?: WorkerRegistry | undefined
): Promise<WorkerRegistry | undefined> {
	const serviceNames = [...(services || []), ...(tailConsumers ?? [])].map(
		(serviceBinding) => serviceBinding.service
	);
	const durableObjectServices = (
		durableObjects || { bindings: [] }
	).bindings.map((durableObjectBinding) => durableObjectBinding.script_name);

	if (serviceNames.length === 0 && durableObjectServices.length === 0) {
		return {};
	}
	const workerDefinitions =
		existingWorkerDefinitions ?? (await fileRegistry.getWorkers());

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
	let previousRegistry: WorkerRegistry | undefined;

	await fileRegistry.start(async (registry) => {
		if (!util.isDeepStrictEqual(registry, previousRegistry)) {
			previousRegistry = registry;
			cb(registry);
		}
	});

	return async (name?: string) => {
		try {
			const [unregisterResult, stopRegistryResult] = await Promise.allSettled([
				name ? fileRegistry.unregister(name) : Promise.resolve(),
				fileRegistry.stop(),
			]);
			if (unregisterResult.status === "rejected") {
				logger.error("Failed to unregister worker", unregisterResult.reason);
			}
			if (stopRegistryResult.status === "rejected") {
				logger.error(
					"Failed to stop worker registry",
					stopRegistryResult.reason
				);
			}
		} catch (err) {
			logger.error("Failed to cleanup dev registry", err);
		}
	};
}
