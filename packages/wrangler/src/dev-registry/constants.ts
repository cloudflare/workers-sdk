export const DEV_REGISTRY_PORT = 6284;
export const DEV_REGISTRY_HOST = `http://localhost:${DEV_REGISTRY_PORT}`;

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
