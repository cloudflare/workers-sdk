export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerDefinition = {
	protocol: "http" | "https";
	host: string;
	port: number;
	entrypointAddresses: Record<
		"default" | string,
		{ host: string; port: number } | undefined
	>;
	durableObjects: { name: string; className: string }[];
};
