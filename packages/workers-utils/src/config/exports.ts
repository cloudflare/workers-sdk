import type {
	DurableObjectExport,
	Exports,
	WorkerEntrypointExport,
} from "./environment";

export type ExportType = Exports[string]["type"];

export interface PartitionedExports {
	"durable-object": Record<string, DurableObjectExport>;
	worker: Record<string, WorkerEntrypointExport>;
}

export function partitionExports(
	exports: Exports | undefined
): PartitionedExports {
	const partitioned: PartitionedExports = {
		"durable-object": {},
		worker: {},
	};

	if (exports === undefined) {
		return partitioned;
	}

	for (const [name, entry] of Object.entries(exports)) {
		partitioned[entry.type][name] = entry;
	}

	return partitioned;
}
