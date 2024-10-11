import type { Binding } from "../api";
import type { Config } from "../config";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerEntrypointsDefinition = Record<
	"default" | string,
	{ host: string; port: number } | undefined
>;

export type WorkerDefinition = {
	port: number | undefined;
	protocol: "http" | "https" | undefined;
	host: string | undefined;
	mode: "local" | "remote";
	headers?: Record<string, string>;
	entrypointAddresses?: WorkerEntrypointsDefinition;
	durableObjects: { name: string; className: string }[];
	durableObjectsHost?: string;
	durableObjectsPort?: number;
};

export interface Registry {
	devRegistry: (
		cb: (workers: WorkerRegistry | undefined) => void
	) => Promise<(name?: string) => Promise<void>>;
	getBoundRegisteredWorkers: (
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
	) => Promise<WorkerRegistry | undefined>;
	getRegisteredWorkers: () => Promise<WorkerRegistry | undefined>;
	registerWorker: (name: string, definition: WorkerDefinition) => Promise<void>;
	startRegistryWatcher: (
		cb: (registry: WorkerRegistry | undefined) => void
	) => Promise<void>;
	stopRegistryWatcher: () => Promise<void>;
	unregisterWorker: (name: string) => Promise<void>;
}
