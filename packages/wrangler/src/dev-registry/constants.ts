export const DEV_REGISTRY_PORT = 6284;
export const DEV_REGISTRY_HOST = `localhost:${DEV_REGISTRY_PORT}`;

export const DEV_REGISTRY_DAEMON_EXIT_TIMEOUT = 10_000;

export type WorkerRegistry = Record<string, WorkerDefinition>;
export type WorkerDefinition = {
	port: number | undefined;
	protocol: "http" | "https" | undefined;
	host: string | undefined;
	mode: "local" | "remote";
	headers?: Record<string, string>;
	durableObjects: { name: string; className: string }[];
	durableObjectsHost?: string;
	durableObjectsPort?: number;
};

export type WorkerRegistryDaemonMessage =
	| { type: "ready" }
	| { type: "error"; error: unknown };

export interface UpdatableWorkerRegistry {
	workers: WorkerRegistry;
	update(definition: WorkerDefinition): Promise<void>;
}
