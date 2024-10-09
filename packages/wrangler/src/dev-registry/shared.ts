import type { Binding } from "../api";
import type { Config } from "../config";
import type { WorkerRegistry } from "./types";

/**
 * a function that takes your serviceNames and durableObjectNames and returns a
 * list of the running workers that we're bound to
 */
export function createGetBoundRegisteredWorkers(
	getRegisteredWorkers:
		| (() => Promise<WorkerRegistry | undefined>)
		| (() => Promise<WorkerRegistry | undefined>)
) {
	return async function getBoundRegisteredWorkers(
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
	};
}
